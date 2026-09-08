// One-time (or staff-triggered) room assignment for a guest tablet.
// A fresh device has no room in localStorage yet, so it shows this screen
// instead of the normal concierge app until staff confirms which room it
// serves. Staff can also force it again later by opening index.html?setup=1
// (e.g. after moving a tablet to a different room). The screen is gated by
// the same staff login as the back office — after confirming the room, the
// session is signed out again immediately, so the tablet never keeps a
// staff-authenticated session lying around for guests to find.
import { supabase } from "./supabaseClient.js";
import { getRooms, setRoom, hasAssignedRoom } from "./store.js";
import { vaseLogo } from "./logo.js";
import { escapeHtml } from "./util.js";

let session = null;
let authError = "";
let picked = null;
let onChange = null;

export function setupActive() {
  return new URLSearchParams(location.search).has("setup") || !hasAssignedRoom();
}

export function initRoomSetup(rerender) {
  onChange = rerender;
  supabase.auth.getSession().then(({ data }) => {
    session = data.session;
    rerender();
  });
}

function shell(inner) {
  return `
    <div class="setup-screen">
      <div class="setup-card">
        <div class="setup-logo">${vaseLogo({ size: 40 })}</div>
        <div style="text-align:center;margin-bottom:18px;"><span class="brand-kicker">SWISS</span> <span class="brand-word">Baan Chiang</span></div>
        ${inner}
      </div>
    </div>`;
}

function loginScreen() {
  return shell(`
    <h2>Zimmer-Einrichtung</h2>
    <p class="muted">Dieses Gerät ist noch keinem Zimmer zugewiesen. Bitte mit dem Personal-Login bestätigen, welches Zimmer dieses Tablet bedient.</p>
    <form data-action="setup-login-form">
      <div class="field"><label>E-Mail</label><input id="setup-email" type="email" autocomplete="username" required /></div>
      <div class="field"><label>Passwort</label><input id="setup-password" type="password" autocomplete="current-password" required /></div>
      ${authError ? `<p style="color:#a34a3a;font-size:13px;margin:-6px 0 14px;">${escapeHtml(authError)}</p>` : ""}
      <button class="pill-btn full gold" type="submit">Anmelden</button>
    </form>`);
}

function pickScreen() {
  const rooms = getRooms();
  return shell(`
    <h2>Zimmer wählen</h2>
    <p class="muted">Welches Zimmer bedient dieses Gerät?</p>
    <div class="setup-room-grid">
      ${rooms.map((r) => `<button class="pill-btn ${picked === r ? "" : "outline"}" data-action="setup-pick-room" data-room="${r}">Zimmer ${escapeHtml(r)}</button>`).join("")}
    </div>
    <button class="pill-btn full gold" data-action="setup-confirm" ${picked ? "" : "disabled"} style="margin-top:18px;">Bestätigen &amp; abmelden</button>`);
}

export function renderRoomSetup() {
  return session ? pickScreen() : loginScreen();
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest('[data-action="setup-login-form"]');
  if (!form) return;
  e.preventDefault();
  const email = document.getElementById("setup-email").value.trim();
  const password = document.getElementById("setup-password").value;
  authError = "";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authError = "E-Mail oder Passwort ist falsch.";
  else session = data.session;
  onChange?.();
});

document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  if (t.dataset.action === "setup-pick-room") {
    picked = t.dataset.room;
    onChange?.();
  }
  if (t.dataset.action === "setup-confirm" && picked) {
    setRoom(picked);
    await supabase.auth.signOut();
    const url = new URL(location.href);
    url.searchParams.delete("setup");
    location.href = url.toString();
  }
});
