// Lets a "reception"-role staff member manage other staff accounts from the
// backoffice UI (js/admin.js "Mitarbeiter verwalten" page) without anyone —
// not the reception user, not Claude — ever handling another person's
// password directly. Invited staff set their own password via the emailed
// link (see setPasswordScreen() in admin.js). Needs the service-role key to
// call the Auth Admin API, so this must run server-side, never in the
// browser bundle.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ROLES = new Set(["reception", "kitchen", "housekeeping", "spa"]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Validate the caller's own session token (not the service-role key) to find
  // out who is calling and what their role is.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) return json({ error: "Nicht angemeldet." }, 401);

  const callerRole = callerData.user.app_metadata?.role || "reception";
  if (callerRole !== "reception") {
    return json({ error: "Nur die Rezeption darf Mitarbeiter verwalten." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (body.action === "list") {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) return json({ error: error.message }, 500);
    const staff = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      role: (u.app_metadata as Record<string, unknown> | undefined)?.role || "reception",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      invited: !u.last_sign_in_at,
    }));
    return json({ staff });
  }

  if (body.action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "");
    if (!email || !email.includes("@")) return json({ error: "Ungültige E-Mail-Adresse." }, 400);
    if (!ROLES.has(role)) return json({ error: "Ungültige Rolle." }, 400);
    const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error) return json({ error: error.message }, 400);
    const { error: roleErr } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { role },
    });
    if (roleErr) return json({ error: roleErr.message }, 500);
    return json({ ok: true, id: data.user.id });
  }

  if (body.action === "set-role") {
    const userId = String(body.userId || "");
    const role = String(body.role || "");
    if (!userId) return json({ error: "userId fehlt." }, 400);
    if (!ROLES.has(role)) return json({ error: "Ungültige Rolle." }, 400);
    if (userId === callerData.user.id && role !== "reception") {
      return json({ error: "Du kannst dir nicht selbst die Rezeption-Rolle entziehen." }, 400);
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Unbekannte Aktion." }, 400);
});
