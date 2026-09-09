// Lets staff auto-translate a German catalogue field (menu/spa/taxi/excursion
// names & descriptions, local tips, welcome text) into English and Thai from
// the backoffice, instead of typing all three languages by hand. Suggestions
// land directly in the editable EN/TH fields (js/admin.js triLang()) so staff
// see and can still correct them before anything is truly saved — nothing is
// ever applied silently in the background.
//
// Needs an Anthropic API key, which — like the Supabase service-role key —
// must live server-side only. Set it once via the Supabase Dashboard:
// Project Settings -> Edge Functions -> Secrets -> ANTHROPIC_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

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

  // Any signed-in staff member may request a translation preview — the actual
  // catalogue write is still gated by Supabase RLS (full-access roles only),
  // so this endpoint itself only needs to confirm the caller is authenticated.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) return json({ error: "Nicht angemeldet." }, 401);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "Übersetzung ist noch nicht eingerichtet (ANTHROPIC_API_KEY fehlt)." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  const text = String(body.text || "").trim();
  const multiline = Boolean(body.multiline);
  if (!text) return json({ error: "Kein Text zum Übersetzen." }, 400);
  if (text.length > 2000) return json({ error: "Text ist zu lang (max. 2000 Zeichen)." }, 400);

  const prompt = `Translate the following German hotel text into English and Thai. ${
    multiline ? "Preserve the line breaks and paragraph structure. " : ""
  }Keep the tone appropriate for a boutique hotel guest-facing app. Respond with ONLY a JSON object of the exact shape {"en": "...", "th": "..."} and nothing else — no markdown, no code fences, no commentary.

German text:
"""
${text}
"""`;

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return json({ error: "Übersetzungsdienst nicht erreichbar." }, 502);
  }

  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text().catch(() => "");
    return json({ error: `Übersetzungsdienst-Fehler (${anthropicRes.status}).`, detail }, 502);
  }

  const anthropicData = await anthropicRes.json();
  const raw = anthropicData?.content?.[0]?.text ?? "";
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: { en?: string; th?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return json({ error: "Antwort des Übersetzungsdiensts konnte nicht gelesen werden." }, 502);
  }

  if (typeof parsed.en !== "string" || typeof parsed.th !== "string") {
    return json({ error: "Unvollständige Übersetzung erhalten." }, 502);
  }

  return json({ en: parsed.en, th: parsed.th });
});
