import { tf } from "./i18n.js";
import {
  getState,
  subscribe,
  isReady,
  initStore,
  getRooms,
  addPostcard,
  updateHotelContent,
  updateRow,
  updateBookingRow,
  setRequestItemStatus,
  onNewRequest,
} from "./store.js";
import { escapeHtml, FONT_OPTIONS, postcardHTML } from "./util.js";
import { icon } from "./icons.js";
import { vaseLogo, wordmarkLogo, fullLockup } from "./logo.js";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabaseClient.js";

const root = document.getElementById("admin");
let page = "dashboard"; // dashboard | postcard | info | dining | housekeeping | spa | taxi | staff
let flash = false;
let session = null;
let authChecked = false;
let authError = "";
// An invite/recovery link lands here with type=invite|recovery in the URL hash;
// supabase-js signs the user in from that hash automatically, but they still
// need to set their own password before seeing the normal backoffice.
let pendingCredentialSetup = /type=(invite|recovery)/.test(location.hash);
let setPasswordError = "";
let setPasswordSubmitting = false;

// Staff role lives in the JWT (app_metadata.role, set via SQL/Auth admin API —
// never editable by the user themselves), mirrored server-side in RLS
// policies (public.is_full_access_staff()). Unset defaults to "reception"
// (full access), same as the DB side. "admin" has the same full access as
// "reception" plus staff management, which "reception" itself no longer has.
const ROLE_LABEL = { admin: "Admin", reception: "Rezeption", kitchen: "Küche", housekeeping: "Housekeeping", spa: "Spa" };
// Maps staff roles to the service `category` values they're scoped to (matches
// the request_items RLS policy exactly: kitchen->chef, housekeeping->housekeeping, spa->spa).
const ROLE_CATEGORIES = { kitchen: ["chef"], housekeeping: ["housekeeping"], spa: ["spa"] };
function currentRole() {
  return session?.user?.app_metadata?.role || "reception";
}
function hasFullAccess() {
  const r = currentRole();
  return r === "reception" || r === "admin";
}
function canManageStaff() {
  return currentRole() === "admin";
}
function canAccessPage(p) {
  if (p === "dashboard") return true;
  if (p === "staff") return canManageStaff();
  return hasFullAccess();
}

// ---------- new-order notifications (sound + browser notification) ----------
const NOTIF_MUTE_KEY = "sbc_admin_muted";
let notifMuted = localStorage.getItem(NOTIF_MUTE_KEY) === "1";
let notifPermission = "Notification" in window ? Notification.permission : "unsupported";

function notifBar() {
  if (notifPermission === "unsupported") return "";
  let inner;
  if (notifPermission === "granted") {
    inner = `<button class="notif-btn" data-action="toggle-mute">${icon(notifMuted ? "volumeX" : "volume2", { size: 14 })} ${notifMuted ? "Ton stumm" : "Benachrichtigungen an"}</button>`;
  } else if (notifPermission === "denied") {
    inner = `<span class="notif-btn muted">${icon("bell", { size: 14 })} Im Browser blockiert</span>`;
  } else {
    inner = `<button class="notif-btn" data-action="enable-notifications">${icon("bellRing", { size: 14 })} Benachrichtigungen aktivieren</button>`;
  }
  return `<div class="admin-notif-bar">${inner}</div>`;
}

async function requestNotifPermission() {
  if (!("Notification" in window)) return;
  notifPermission = await Notification.requestPermission();
  render();
}

function toggleNotifMute() {
  notifMuted = !notifMuted;
  localStorage.setItem(NOTIF_MUTE_KEY, notifMuted ? "1" : "0");
  render();
}

function playChime() {
  if (notifMuted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // Autoplay/audio restrictions before the first user gesture — fail silently,
    // the browser notification below still gets shown.
  }
}

function showRequestNotification(item) {
  if (notifPermission !== "granted") return;
  const room = getState().requests.find((r) => r.id === item.requestId)?.room || "";
  const notif = new Notification(`Neue Anfrage — Villa ${room}`, {
    body: `${tf(item.serviceName, "de")}${item.summary ? `: ${item.summary}` : ""}`,
    icon: "favicon-32.png",
    tag: `request-item-${item.id}`,
  });
  notif.onclick = () => {
    window.focus();
    notif.close();
  };
}

onNewRequest((item) => {
  if (!session) return;
  const allowedCategories = ROLE_CATEGORIES[currentRole()];
  if (allowedCategories && !allowedCategories.includes(item.category)) return;
  playChime();
  showRequestNotification(item);
});

// postcard-compose state
let pcRoom = "all";
let pcFont = FONT_OPTIONS[0].id;
let pcText = "";

// staff-management state
const ROLE_OPTIONS = [
  { id: "admin", label: "Admin" },
  { id: "reception", label: "Rezeption" },
  { id: "kitchen", label: "Küche" },
  { id: "housekeeping", label: "Housekeeping" },
  { id: "spa", label: "Spa" },
];
let staffList = null; // null = not loaded yet
let staffLoading = false;
let staffError = "";
let staffActionError = "";
let staffActionMessage = "";
let staffInviteEmail = "";
let staffInviteRole = "kitchen";
let staffInviting = false;
let staffJustInvited = "";

async function callStaffFn(action, payload = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-staff`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unbekannter Fehler.");
  return data;
}

async function loadStaff() {
  staffLoading = true;
  staffError = "";
  render();
  try {
    const data = await callStaffFn("list");
    staffList = [...data.staff].sort((a, b) => a.email.localeCompare(b.email));
  } catch (err) {
    staffError = err.message;
  }
  staffLoading = false;
  render();
}

async function handleStaffSetRole(userId, role) {
  staffActionError = "";
  staffActionMessage = "";
  try {
    await callStaffFn("set-role", { userId, role });
    const u = staffList?.find((x) => x.id === userId);
    if (u) u.role = role;
  } catch (err) {
    staffActionError = err.message;
  }
  render();
}

async function handleStaffResetPassword(email) {
  staffActionError = "";
  staffActionMessage = "";
  try {
    const redirectTo = new URL("admin.html", location.href).href;
    await callStaffFn("reset-password", { email, redirectTo });
    staffActionMessage = `Passwort-Reset-E-Mail an ${email} verschickt.`;
  } catch (err) {
    staffActionError = err.message;
  }
  render();
}

async function handleStaffDelete(userId, email) {
  if (!confirm(`Konto ${email} wirklich unwiderruflich löschen?`)) return;
  staffActionError = "";
  staffActionMessage = "";
  try {
    await callStaffFn("remove", { userId });
    staffList = staffList?.filter((x) => x.id !== userId) ?? null;
    staffActionMessage = `Konto ${email} gelöscht.`;
  } catch (err) {
    staffActionError = err.message;
  }
  render();
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
  cur[keys[keys.length - 1]] = value;
}
function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

const TABLE_FOR = { services: "services" };
const COL_FOR = { desc: "description", optionGroups: "option_groups", fromPrice: "from_price", priceUnit: "price_unit", shortDesc: "short_desc" };

// Applies one `data-bind` path change both to the local cache (instant UI feedback)
// and to the matching Supabase table/column (so it reaches every other device).
async function commit(path, value) {
  const s = getState();
  setPath(s, path, value);
  flash = true;
  render();
  setTimeout(() => {
    flash = false;
    document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
  }, 1400);

  const segs = path.split(".");
  const root0 = segs[0];
  if (root0 === "content") {
    // Always send the whole field (s.content[field]), not the raw leaf `value" —
    // fields like localTips are nested arrays, and persisting just the changed
    // leaf string would overwrite the entire column with that one string.
    const field = segs[1];
    await updateHotelContent({ [camelToSnake(field)]: s.content[field] });
  } else if (root0 === "spaSlots") {
    await updateHotelContent({ spa_slots: s.spaSlots });
  } else if (root0 === "bookings") {
    // bookings.room (not id) is the primary key.
    const row = s.bookings[Number(segs[1])];
    const field = segs[2];
    await updateBookingRow(row.room, { [camelToSnake(field)]: row[field] });
  } else if (TABLE_FOR[root0]) {
    const index = Number(segs[1]);
    const field = segs[2];
    const row = s[root0][index];
    const dbCol = COL_FOR[field] || field;
    const isJsonbLang = segs.length > 3; // e.g. menu.0.name.de -> whole `name` object changed
    await updateRow(TABLE_FOR[root0], row.id, { [dbCol]: isJsonbLang ? row[field] : value });
  }
}

async function commitLocalTips() {
  const s = getState();
  flash = true;
  render();
  setTimeout(() => {
    flash = false;
    document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
  }, 1400);
  await updateHotelContent({ local_tips: s.content.localTips });
}

async function commitServiceOptionGroups(si) {
  const s = getState();
  const row = s.services[si];
  flash = true;
  render();
  setTimeout(() => {
    flash = false;
    document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
  }, 1400);
  await updateRow("services", row.id, { option_groups: row.optionGroups });
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function sidebar() {
  const fullAccess = hasFullAccess();
  const canStaff = canManageStaff();
  const items = [
    { id: "dashboard", icon: "clipboardList", label: "Anfragen" },
    ...(fullAccess ? [{ id: "postcard", icon: "mail", label: "Postkarte senden" }] : []),
  ];
  const contentItems = [
    { id: "info", icon: "conciergeBell", label: "Hotel-Infos" },
    { id: "services", icon: "utensilsCrossed", label: "Services" },
    { id: "bookings", icon: "doorOpen", label: "Buchungen" },
  ];
  const accessItems = [
    ...(fullAccess ? [{ id: "qr", icon: "doorOpen", label: "QR-Codes fürs Zimmer" }] : []),
    ...(canStaff ? [{ id: "staff", icon: "users", label: "Mitarbeiter verwalten" }] : []),
  ];
  return `
    <div class="admin-sidebar">
      <div class="admin-brand">
        <div class="brand-mark">${vaseLogo({ size: 34 })}</div>
        <div><div class="admin-brand-name">${wordmarkLogo({ height: 20 })}</div><div class="admin-brand-sub">Backoffice</div></div>
      </div>
      ${notifBar()}
      <div class="admin-nav">
        <div class="section-label">Live</div>
        ${items.map((i) => navBtn(i)).join("")}
        ${
          fullAccess
            ? `<div class="section-label">Inhalte pflegen</div>
               ${contentItems.map((i) => navBtn(i)).join("")}`
            : ""
        }
        ${
          accessItems.length
            ? `<div class="section-label">Gästezugang &amp; Personal</div>
               ${accessItems.map((i) => navBtn(i)).join("")}`
            : ""
        }
      </div>
      <div class="admin-footer-note">
        Änderungen werden sofort auf allen geöffneten Zimmer-Tablets angezeigt.
        <div style="margin-top:10px;">
          <span style="opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">${escapeHtml(session?.user?.email || "")}</span>
          <div class="row-between" style="margin-top:4px;">
            <span class="kanban-count" style="background:rgba(191,166,114,0.25);color:var(--gold-500);">${escapeHtml(ROLE_LABEL[currentRole()] || currentRole())}</span>
            <button data-action="logout" style="background:none;border:none;color:inherit;opacity:0.7;cursor:pointer;text-decoration:underline;padding:0;font-size:11px;">Abmelden</button>
          </div>
        </div>
      </div>
    </div>`;
}
function navBtn(i) {
  return `<button class="${page === i.id ? "active" : ""}" data-action="nav" data-page="${i.id}">${icon(i.icon, { size: 16 })} ${i.label}</button>`;
}

function topHeader(title, sub) {
  return `
    <div class="admin-header">
      <div><h1>${title}</h1><div class="sub">${sub}</div></div>
      <div style="text-align:right;">
        <div class="sync-note"><span class="sync-dot"></span> Live synchronisiert mit Zimmer-Tablets</div>
        <div class="save-flash ${flash ? "show" : ""}">${icon("check", { size: 13 })} Gespeichert &amp; veröffentlicht</div>
      </div>
    </div>`;
}

// ---------- DASHBOARD (Anfragen / request items) ----------
const REQ_STATUSES = [
  { id: "in_pruefung", label: "In Prüfung" },
  { id: "bestaetigt", label: "Bestätigt" },
  { id: "erledigt", label: "Erledigt" },
];
const CATEGORY_LABEL = {
  transfer: "Flughafen-Transfer", housekeeping: "Housekeeping", chef: "Private Chef", spa: "Spa & Massage",
  laundry: "Wäscherei", excursions: "Golf & Ausflüge", vehicle: "Auto & Scooter", visa: "Visa & Behörden", maintenance: "Wartung & Technik",
};
const CATEGORY_ICON = {
  transfer: "carTaxiFront", housekeeping: "brushCleaning", chef: "utensilsCrossed", spa: "flower2",
  laundry: "shirt", excursions: "mapPin", vehicle: "carTaxiFront", visa: "scrollText", maintenance: "sparkles",
};
const NEXT_REQ_STATUS = { in_pruefung: "bestaetigt", bestaetigt: "erledigt" };

const ROLE_DASHBOARD_TITLE = {
  reception: ["Anfragen", "Alle Gästeanfragen in Echtzeit"],
  kitchen: ["Private-Chef-Anfragen", "Anfragen aus den Villen in Echtzeit"],
  housekeeping: ["Housekeeping-Anfragen", "Anfragen aus den Villen in Echtzeit"],
  spa: ["Spa-Anfragen", "Anfragen aus den Villen in Echtzeit"],
};

function viewDashboard() {
  const role = currentRole();
  const allowedCategories = ROLE_CATEGORIES[role];
  const s = getState();
  const items = [...s.requestItems]
    .filter((i) => !allowedCategories || allowedCategories.includes(i.category))
    .sort((a, b) => b.createdAt - a.createdAt);
  const [title, sub] = ROLE_DASHBOARD_TITLE[role] || ROLE_DASHBOARD_TITLE.reception;
  return `
    ${topHeader(title, sub)}
    <div class="kanban">
      ${REQ_STATUSES.map((st) => {
        const list = items.filter((i) => i.status === st.id);
        return `
        <div class="kanban-col">
          <h3>${st.label} <span class="kanban-count">${list.length}</span></h3>
          ${list.length === 0 ? `<p class="muted" style="font-size:13px;">Keine Einträge</p>` : list.map((i) => requestChip(i)).join("")}
        </div>`;
      }).join("")}
    </div>`;
}

function requestChip(item) {
  const room = getState().requests.find((r) => r.id === item.requestId)?.room || "";
  const next = NEXT_REQ_STATUS[item.status];
  return `
    <div class="order-chip">
      <div class="row-between">
        <span class="room-tag">${escapeHtml(room)}</span>
        <span class="type-tag">${CATEGORY_ICON[item.category] ? icon(CATEGORY_ICON[item.category], { size: 13 }) : ""} ${CATEGORY_LABEL[item.category] || item.category}</span>
      </div>
      <div class="items">${escapeHtml(tf(item.serviceName, "de"))}</div>
      ${item.summary ? `<div class="note">${icon("scrollText", { size: 13 })} ${escapeHtml(item.summary)}</div>` : ""}
      <div class="meta">${fmtTime(item.createdAt)}${item.price != null ? ` · CHF ${item.price.toFixed(0)}` : ""}</div>
      <input class="fulfillment-input" placeholder="Notiz zur Erledigung (z. B. Fahrer &amp; Nummer)" value="${escapeAttr(item.fulfillmentNote || "")}" data-action="set-fulfillment" data-id="${item.id}" />
      <div class="actions">
        ${next ? `<button class="pill-btn sm" data-action="advance-request" data-id="${item.id}" data-next="${next}">${icon("arrowRight", { size: 13 })} ${REQ_STATUSES.find((s) => s.id === next).label}</button>` : ""}
        ${item.status !== "in_pruefung" ? `<button class="pill-btn sm outline" data-action="advance-request" data-id="${item.id}" data-next="in_pruefung">↺</button>` : ""}
      </div>
    </div>`;
}

// ---------- POSTCARD COMPOSER ----------
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("de-CH", { day: "2-digit", month: "long", year: "numeric" });
}

function viewPostcard() {
  const s = getState();
  const sent = [...s.postcards].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const recipientLabel = pcRoom === "all" ? "Alle Zimmer" : "Zimmer " + pcRoom;
  return `
    ${topHeader("Postkarte senden", "Eine persönliche Grussbotschaft direkt aufs Gästegerät schicken")}

    <div class="editor-section">
      <h3>Empfänger</h3>
      <div class="font-swatches">
        <button class="font-swatch ${pcRoom === "all" ? "active" : ""}" data-action="pc-set-room" data-room="all" style="min-width:110px;">
          <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon("users", { size: 18 })}</div><div class="label">Alle Zimmer</div>
        </button>
        ${getRooms()
          .map(
            (r) => `
          <button class="font-swatch ${pcRoom === r ? "active" : ""}" data-action="pc-set-room" data-room="${r}" style="min-width:90px;">
            <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon("doorOpen", { size: 18 })}</div><div class="label">Zimmer ${r}</div>
          </button>`
          )
          .join("")}
      </div>
    </div>

    <div class="editor-section">
      <h3>Vorschau &amp; Nachricht</h3>
      ${postcardHTML({
        idPrefix: "pc",
        message: pcText,
        fontId: pcFont,
        placeholder: "So erscheint deine Postkarte auf dem Gästegerät …",
        postmarkLine1: "Swiss Baan Chiang",
        postmarkLine2: fmtDate(Date.now()),
        footerHtml: `Mit herzlichen Grüssen aus dem Swiss Baan Chiang · ${escapeHtml(recipientLabel)}`,
      })}

      <div class="plain-field" style="margin-top:16px;"><label>Schriftart</label></div>
      <div class="font-swatches">
        ${FONT_OPTIONS.map(
          (f) => `
          <button class="font-swatch ${f.id === pcFont ? "active" : ""}" data-action="pc-set-font" data-font="${f.id}">
            <div class="sample" style="font-family:${f.family};">Aa</div>
            <div class="label">${f.label}</div>
          </button>`
        ).join("")}
      </div>

      <textarea id="pc-text" rows="4" placeholder="Nachricht eingeben …" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:11px 13px;font-size:14px;font-family:inherit;"></textarea>
      <button class="pill-btn full gold" id="pc-send-btn" data-action="pc-send" ${pcText.trim() ? "" : "disabled"} style="margin-top:14px;">Postkarte an ${escapeHtml(recipientLabel)} senden</button>
    </div>

    <div class="editor-section">
      <h3>Zuletzt gesendet</h3>
      ${
        sent.length === 0
          ? `<p class="muted" style="font-size:13px;">Noch keine Postkarte gesendet.</p>`
          : sent
              .map(
                (p) => `
          <div class="order-chip">
            <div class="row-between">
              <span class="room-tag">${p.room === "all" ? "Alle Zimmer" : "Zi. " + escapeHtml(p.room)}</span>
              <span class="type-tag">${fmtTime(p.createdAt)}</span>
            </div>
            <div class="note" style="margin-top:4px;">${escapeHtml(p.text)}</div>
          </div>`
              )
              .join("")
      }
    </div>`;
}

function updatePcPreview() {
  const msg = document.getElementById("pc-message");
  const btn = document.getElementById("pc-send-btn");
  if (!msg) return;
  const trimmed = pcText.trim();
  if (trimmed) {
    msg.textContent = pcText;
    msg.classList.remove("placeholder");
    msg.style.fontFamily = FONT_OPTIONS.find((f) => f.id === pcFont)?.family || "";
  } else {
    msg.textContent = "So erscheint deine Postkarte auf dem Gästegerät …";
    msg.classList.add("placeholder");
  }
  if (btn) btn.disabled = !trimmed;
}

function hydratePostcardPage() {
  const ta = document.getElementById("pc-text");
  if (ta) ta.value = pcText;
  updatePcPreview();
}

const TIP_ICON_CHOICES = [
  { id: "landmark", label: "Wahrzeichen" },
  { id: "mountain", label: "Aussicht / Berg" },
  { id: "shoppingBag", label: "Markt / Shopping" },
  { id: "mapPin", label: "Ort" },
  { id: "users", label: "Treffpunkt" },
  { id: "sparkles", label: "Besonderes Erlebnis" },
  { id: "clock", label: "Zeitlich begrenzt" },
];

// ---------- INFO EDITOR ----------
// staff writes German, clicks "Übersetzen" to fill EN/TH via the translate-fields
// Edge Function (Anthropic API) — result lands directly in the editable fields
// below, so staff sees and can still correct it before it's ever committed, same
// as if they'd typed it themselves. Never applied silently in the background.
let translatingPath = null;
let translateErrorPath = null;
let translateError = "";

async function callTranslateFn(text, multiline) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/translate-fields`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ text, multiline }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Übersetzung fehlgeschlagen.");
  return data;
}

async function handleTranslate(basePath, multiline) {
  const deEl = document.querySelector(`[data-bind="${basePath}.de"]`);
  const text = (deEl?.value || "").trim();
  if (!text) return;
  translateError = "";
  translateErrorPath = null;
  translatingPath = basePath;
  render();
  try {
    const data = await callTranslateFn(text, multiline);
    await commit(`${basePath}.en`, data.en || "");
    await commit(`${basePath}.th`, data.th || "");
  } catch (err) {
    translateError = err.message;
    translateErrorPath = basePath;
  }
  translatingPath = null;
  render();
}

function triLang(baseLabel, basePath, multiline = false) {
  const s = getState();
  const langs = [["de", "DE"], ["en", "EN"], ["th", "TH"]];
  const busy = translatingPath === basePath;
  return `
    <div class="plain-field">
      <div class="ml-label-row">
        <label>${baseLabel}</label>
        <button type="button" class="translate-btn" data-action="translate" data-base-path="${basePath}" data-multiline="${multiline}" ${busy ? "disabled" : ""}>
          ${icon("languages", { size: 12 })} ${busy ? "Übersetzt …" : "Übersetzen"}
        </button>
      </div>
      <div class="editor-grid cols-3">
        ${langs
          .map(([code, tag]) => {
            const path = `${basePath}.${code}`;
            const val = getPath(s, path) ?? "";
            return multiline
              ? `<div class="ml-field"><span class="lang-tag">${tag}</span><textarea data-bind="${path}">${val}</textarea></div>`
              : `<div class="ml-field"><span class="lang-tag">${tag}</span><input value="${escapeAttr(val)}" data-bind="${path}" /></div>`;
          })
          .join("")}
      </div>
      ${translateErrorPath === basePath && translateError ? `<p style="color:#a34a3a;font-size:12px;margin-top:6px;">${escapeHtml(translateError)}</p>` : ""}
    </div>`;
}

function escapeAttr(v) {
  return String(v).replace(/"/g, "&quot;");
}

function viewInfo() {
  const c = getState().content;
  return `
    ${topHeader("Hotel-Infos", "Diese Angaben sehen Gäste unter „Hotelinfo“")}
    <div class="editor-section">
      <h3>WLAN &amp; Rezeption</h3>
      <div class="editor-grid">
        <div class="plain-field"><label>WLAN-Netzwerk</label><input value="${escapeAttr(c.wifiSsid)}" data-bind="content.wifiSsid" /></div>
        <div class="plain-field"><label>WLAN-Passwort</label><input value="${escapeAttr(c.wifiPassword)}" data-bind="content.wifiPassword" /></div>
        <div class="plain-field"><label>Rezeption Telefon</label><input value="${escapeAttr(c.receptionPhone)}" data-bind="content.receptionPhone" /></div>
      </div>
    </div>

    <div class="editor-section">
      <h3>Concierge &amp; Notfall <span class="rules-hint">(für „Direkt schreiben" und „Im Notfall" im Gäste-Portal)</span></h3>
      <div class="editor-grid">
        <div class="plain-field"><label>Concierge-Name</label><input value="${escapeAttr(c.conciergeName)}" data-bind="content.conciergeName" /></div>
        <div class="plain-field"><label>Concierge WhatsApp-Nummer</label><input value="${escapeAttr(c.conciergePhone)}" data-bind="content.conciergePhone" placeholder="+66812345678" /></div>
        <div class="plain-field"><label>Spital (Name &amp; Distanz)</label><input value="${escapeAttr(c.emergencyHospital)}" data-bind="content.emergencyHospital" /></div>
        <div class="plain-field"><label>Notrufnummer</label><input value="${escapeAttr(c.emergencyNumber)}" data-bind="content.emergencyNumber" /></div>
      </div>
    </div>

    <div class="editor-section">
      <h3>Öffnungszeiten</h3>
      <div class="editor-grid cols-3">
        <div class="plain-field"><label>Frühstück</label><input value="${escapeAttr(c.breakfastHours)}" data-bind="content.breakfastHours" /></div>
        <div class="plain-field"><label>Restaurant</label><input value="${escapeAttr(c.restaurantHours)}" data-bind="content.restaurantHours" /></div>
        <div class="plain-field"><label>Spa</label><input value="${escapeAttr(c.spaHours)}" data-bind="content.spaHours" /></div>
        <div class="plain-field"><label>Check-in</label><input value="${escapeAttr(c.checkin)}" data-bind="content.checkin" /></div>
        <div class="plain-field"><label>Check-out</label><input value="${escapeAttr(c.checkout)}" data-bind="content.checkout" /></div>
      </div>
    </div>

    <div class="editor-section">
      <h3>Willkommenstext</h3>
      ${triLang("", "content.welcome", true)}
    </div>

    <div class="editor-section">
      <h3>Hausregeln <span class="rules-hint">(eine Regel pro Zeile)</span></h3>
      <div class="editor-grid cols-3">
        ${["de", "en", "th"]
          .map((code) => {
            const val = (c.rules[code] || []).join("\n");
            return `<div class="ml-field"><span class="lang-tag">${code.toUpperCase()}</span><textarea data-bind="content.rules.${code}" data-list="true" style="min-height:110px;">${val}</textarea></div>`;
          })
          .join("")}
      </div>
    </div>

    <div class="editor-section">
      <h3>Ausflugstipps</h3>
      ${c.localTips
        .map(
          (tip, i) => `
        <div class="item-editor-row">
          <div class="row-top">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:var(--copper);display:flex;">${icon(tip.icon, { size: 18 })}</span>
              <select data-bind="content.localTips.${i}.icon" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px;">
                ${TIP_ICON_CHOICES.map((c) => `<option value="${c.id}" ${c.id === tip.icon ? "selected" : ""}>${c.label}</option>`).join("")}
              </select>
            </div>
            <button class="remove-btn" data-action="remove-tip" data-index="${i}">${icon("x", { size: 13 })}</button>
          </div>
          ${triLang("Titel", `content.localTips.${i}.title`)}
          ${triLang("Text", `content.localTips.${i}.desc`)}
          <div class="num-row">
            <div class="field-mini"><label>Fahrzeit (z. B. „8 Min.")</label><input value="${escapeAttr(tip.travelTime || "")}" data-bind="content.localTips.${i}.travelTime" /></div>
            <div class="field-mini"><label>Tags (kommagetrennt, z. B. „Essen, Mit Kindern")</label><input value="${(tip.tags || []).join(", ")}" data-bind="content.localTips.${i}.tags" data-list="comma" /></div>
          </div>
          ${triLang("Aktions-Link (optional, z. B. Tisch anfragen)", `content.localTips.${i}.actionLabel`)}
        </div>`
        )
        .join("")}
      <button class="add-btn" data-action="add-tip">+ Tipp hinzufügen</button>
    </div>
  `;
}

// ---------- SERVICES EDITOR (unified catalog, 9 fixed categories) ----------
// Each service's own option groups drive the guest-facing Service-Detail
// screen. Staff can edit name/description/price and, for choice-driven groups
// (segmented/choice-list), add or remove the individual options — the group
// structure itself (which categories have which groups) is fixed by design,
// mirrored from the mockups, so it isn't editable here.
function groupOptionsHaveOwnPrice(group) {
  return (group.options || []).some((o) => o.price != null);
}

function viewServices() {
  const s = getState();
  return `
    ${topHeader("Services", "Der Servicekatalog, den Gäste im Portal durchstöbern und anfragen")}
    ${s.services
      .map(
        (sv, si) => `
      <div class="editor-section">
        <h3>${escapeHtml(tf(sv.name, "de"))}</h3>
        ${triLang("Name", `services.${si}.name`)}
        ${triLang("Kurzbeschreibung", `services.${si}.shortDesc`)}
        <div class="num-row">
          <div class="field-mini">
            <label>Ab-Preis (CHF, leer = „inklusive")</label>
            <input type="number" step="1" value="${sv.fromPrice ?? ""}" data-bind="services.${si}.fromPrice" data-number="true" />
          </div>
          <div class="field-mini"><label>Preiseinheit (optional, z. B. „Tag")</label><input value="${escapeAttr(sv.priceUnit || "")}" data-bind="services.${si}.priceUnit" /></div>
        </div>
        ${sv.optionGroups.map((g, gi) => optionGroupEditor(sv, si, g, gi)).join("")}
      </div>`
      )
      .join("")}`;
}

function optionGroupEditor(service, si, group, gi) {
  const hasOptions = group.type === "segmented" || group.type === "choice-list";
  return `
    <div class="item-editor-row" style="background:rgba(191,166,114,0.06);">
      <div class="row-top"><span class="muted">Gruppe „${escapeHtml(group.key)}" (${escapeHtml(group.type)})</span></div>
      ${triLang("Feldbezeichnung", `services.${si}.optionGroups.${gi}.label`)}
      ${
        hasOptions
          ? `
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:10px;">
          ${(group.options || [])
            .map(
              (opt, oi) => `
            <div class="item-editor-row" style="margin-bottom:0;">
              <div class="row-top">
                <span class="muted">Option ${oi + 1}</span>
                <button class="remove-btn" data-action="remove-option" data-si="${si}" data-gi="${gi}" data-oi="${oi}">${icon("x", { size: 13 })}</button>
              </div>
              ${triLang("Bezeichnung", `services.${si}.optionGroups.${gi}.options.${oi}.label`)}
              ${
                opt.price != null || groupOptionsHaveOwnPrice(group)
                  ? `<div class="num-row"><div class="field-mini"><label>Preis (CHF)</label><input type="number" step="1" value="${opt.price ?? 0}" data-bind="services.${si}.optionGroups.${gi}.options.${oi}.price" data-number="true" /></div></div>`
                  : ""
              }
            </div>`
            )
            .join("")}
        </div>
        <button class="add-btn" data-action="add-option" data-si="${si}" data-gi="${gi}">+ Option hinzufügen</button>`
          : ""
      }
    </div>`;
}

// ---------- BOOKINGS EDITOR (current stay per villa) ----------
function viewBookings() {
  const s = getState();
  return `
    ${topHeader("Buchungen", "Die aktuelle Buchung je Villa — das sehen Gäste unter „Deine Buchung“")}
    ${s.bookings
      .map(
        (b, i) => `
      <div class="editor-section">
        <h3>${escapeHtml(b.room)}</h3>
        <div class="editor-grid">
          <div class="plain-field"><label>Gastname</label><input value="${escapeAttr(b.guestName)}" data-bind="bookings.${i}.guestName" /></div>
          <div class="plain-field"><label>Buchungsnummer</label><input value="${escapeAttr(b.bookingCode)}" data-bind="bookings.${i}.bookingCode" /></div>
          <div class="plain-field"><label>Anreise</label><input type="date" value="${b.arrival || ""}" data-bind="bookings.${i}.arrival" /></div>
          <div class="plain-field"><label>Abreise</label><input type="date" value="${b.departure || ""}" data-bind="bookings.${i}.departure" /></div>
        </div>
        <div class="num-row">
          <div class="field-mini"><label>Erwachsene</label><input type="number" min="0" value="${b.guestsAdults}" data-bind="bookings.${i}.guestsAdults" data-number="true" /></div>
          <div class="field-mini"><label>Kinder</label><input type="number" min="0" value="${b.guestsChildren}" data-bind="bookings.${i}.guestsChildren" data-number="true" /></div>
          <div class="field-mini"><label>Schlafzimmer</label><input type="number" min="0" value="${b.bedrooms ?? ""}" data-bind="bookings.${i}.bedrooms" data-number="true" /></div>
          <div class="field-mini"><label>Fläche (m²)</label><input type="number" min="0" value="${b.sizeSqm ?? ""}" data-bind="bookings.${i}.sizeSqm" data-number="true" /></div>
        </div>
        <div class="editor-grid">
          <div class="plain-field"><label>Ausstattungs-Highlight</label><input value="${escapeAttr(b.feature)}" data-bind="bookings.${i}.feature" placeholder="z. B. Gartenpool" /></div>
          <div class="plain-field"><label>Reinigungsplan</label><input value="${escapeAttr(b.cleaningSchedule)}" data-bind="bookings.${i}.cleaningSchedule" placeholder="z. B. Mo &amp; Do, 10:00" /></div>
          <div class="plain-field"><label>Kaution</label><input value="${escapeAttr(b.depositStatus)}" data-bind="bookings.${i}.depositStatus" placeholder="z. B. hinterlegt" /></div>
          <div class="plain-field"><label>Wetter-Hinweis</label><input value="${escapeAttr(b.weatherNote)}" data-bind="bookings.${i}.weatherNote" placeholder="z. B. Hua Hin · 31° · sonnig" /></div>
        </div>
        <div class="plain-field"><label>Adresse</label><input value="${escapeAttr(b.address)}" data-bind="bookings.${i}.address" /></div>
      </div>`
      )
      .join("")}`;
}

// ---------- QR CODES ----------
// Room names (e.g. "Villa Jungfrau") aren't safe as filenames as-is — slugify
// for the QR image path. Must match the slug() in generate-qrcodes.js.
function slugifyRoom(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function viewQr() {
  const rooms = getRooms();
  return `
    ${topHeader("QR-Codes fürs Zimmer", "Zum Ausdrucken und im Zimmer auslegen (z. B. Tischaufsteller)")}
    <div class="editor-section">
      <p class="muted" style="margin-bottom:16px;">
        Ein Gast, der diesen Code mit dem eigenen Smartphone scannt, landet direkt in der App
        mit bereits ausgewähltem Zimmer — ganz ohne Anmeldung. Ein bereits eingerichtetes
        Zimmer-Tablet ändert sich dadurch nicht (das bleibt fest zugewiesen).
      </p>
      <button class="pill-btn" data-action="print" style="margin-bottom:20px;">${icon("scrollText", { size: 15 })} Diese Seite drucken</button>
      <div class="qr-grid">
        ${rooms
          .map((r) => {
            const file = `qr/zimmer-${slugifyRoom(r)}.png`;
            return `
          <div class="qr-card">
            <img src="${file}" alt="QR-Code Zimmer ${escapeHtml(r)}" />
            <div class="qr-room">Zimmer ${escapeHtml(r)}</div>
            <div class="qr-url">${escapeHtml(SITE_URL)}/index.html?room=${escapeHtml(r)}</div>
            <a class="pill-btn sm outline no-print" href="${file}" download="${file.split("/").pop()}">Herunterladen</a>
          </div>`;
          })
          .join("")}
      </div>
      <p class="rules-hint" style="margin-top:18px;">
        Neues Zimmer hinzugekommen? <code>node generate-qrcodes.js</code> im Projektordner
        erneut ausführen (Liste dort mit der <code>rooms</code>-Tabelle abgleichen) und die
        neue PNG-Datei ins Projekt committen/pushen.
      </p>
    </div>`;
}

// ---------- STAFF MANAGEMENT ----------
function viewStaff() {
  return `
    ${topHeader("Mitarbeiter verwalten", "Zugänge einladen und Rollen zuweisen")}
    ${staffActionError ? `<p style="color:#a34a3a;font-size:13px;margin-bottom:14px;">${escapeHtml(staffActionError)}</p>` : ""}
    ${staffActionMessage ? `<p style="color:var(--status-done);font-size:13px;margin-bottom:14px;">${icon("check", { size: 13 })} ${escapeHtml(staffActionMessage)}</p>` : ""}
    <div class="editor-section">
      <h3>Neuen Mitarbeiter einladen</h3>
      <form data-action="staff-invite-form" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div class="plain-field" style="flex:1;min-width:220px;margin-bottom:0;">
          <label>E-Mail</label>
          <input type="email" id="staff-invite-email" required value="${escapeHtml(staffInviteEmail)}" />
        </div>
        <div class="plain-field" style="min-width:160px;margin-bottom:0;">
          <label>Rolle</label>
          <select id="staff-invite-role">
            ${ROLE_OPTIONS.map((r) => `<option value="${r.id}" ${r.id === staffInviteRole ? "selected" : ""}>${r.label}</option>`).join("")}
          </select>
        </div>
        <button class="pill-btn gold" type="submit" ${staffInviting ? "disabled" : ""}>${staffInviting ? "Sende Einladung …" : "Einladen"}</button>
      </form>
      <p class="rules-hint" style="margin-top:10px;">
        Der/die Mitarbeiter*in bekommt eine E-Mail mit einem Anmelde-Link und legt dort das
        eigene Passwort fest — niemand sonst gibt oder sieht dieses Passwort.
      </p>
      ${staffJustInvited ? `<p style="color:var(--status-done);font-size:13px;margin-top:10px;">${icon("check", { size: 13 })} Einladung an ${escapeHtml(staffJustInvited)} verschickt.</p>` : ""}
    </div>

    <div class="editor-section">
      <h3>Bestehende Zugänge</h3>
      ${
        staffLoading && !staffList
          ? `<p class="muted">Lädt …</p>`
          : staffError
          ? `<p style="color:#a34a3a;font-size:13px;">${escapeHtml(staffError)}</p>`
          : (staffList || []).map((u) => staffRow(u)).join("") || `<p class="muted">Keine Konten gefunden.</p>`
      }
    </div>`;
}

function staffRow(u) {
  const isSelf = u.id === session?.user?.id;
  return `
    <div class="item-editor-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div>
        <div style="font-weight:700;color:var(--teal-950);">${escapeHtml(u.email)}${isSelf ? ` <span class="kanban-count">Du</span>` : ""}</div>
        <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">
          ${u.invited ? "Eingeladen, noch nicht angemeldet" : "Zuletzt angemeldet: " + fmtDate(new Date(u.lastSignInAt).getTime())}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <select data-action="staff-set-role" data-user-id="${u.id}" ${isSelf ? "disabled title=\"Du kannst dir nicht selbst die Rolle ändern\"" : ""}>
          ${ROLE_OPTIONS.map((r) => `<option value="${r.id}" ${r.id === u.role ? "selected" : ""}>${r.label}</option>`).join("")}
        </select>
        <button class="pill-btn sm outline" data-action="staff-reset-pw" data-user-id="${u.id}" data-email="${escapeHtml(u.email)}" title="Passwort zurücksetzen">${icon("keyRound", { size: 13 })}</button>
        <button class="pill-btn sm outline" data-action="staff-delete" data-user-id="${u.id}" data-email="${escapeHtml(u.email)}" style="color:#a34a3a;" title="Konto löschen" ${isSelf ? "disabled" : ""}>${icon("trash2", { size: 13 })}</button>
      </div>
    </div>`;
}

function hydrateStaffPage() {
  if (staffList === null && !staffLoading) loadStaff();
}

const SITE_URL = "https://concierge.swissbaanchiang.com";
const PAGES = { dashboard: viewDashboard, postcard: viewPostcard, info: viewInfo, services: viewServices, bookings: viewBookings, qr: viewQr, staff: viewStaff };
const BLANK_TIP = () => ({
  icon: "mapPin", title: { de: "Neuer Tipp", en: "New tip", th: "เคล็ดลับใหม่" }, desc: { de: "", en: "", th: "" },
  travelTime: "", tags: [], actionLabel: { de: "", en: "", th: "" },
});

// ---------- auth screens ----------
function loadingScreen() {
  return `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;color:var(--ink-soft);font-size:14px;">Lädt …</div>`;
}
function loginScreen() {
  return `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;">
      <form data-action="login-form" style="background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius);padding:36px;width:340px;box-shadow:var(--shadow);">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:22px;">
          ${fullLockup({ height: 90 })}
          <div class="admin-brand-sub" style="color:var(--ink-soft);margin-top:2px;">Backoffice-Login</div>
        </div>
        <div class="plain-field"><label>E-Mail</label><input id="login-email" type="email" autocomplete="username" required /></div>
        <div class="plain-field"><label>Passwort</label><input id="login-password" type="password" autocomplete="current-password" required /></div>
        ${authError ? `<p style="color:#a34a3a;font-size:13px;margin:-6px 0 14px;">${escapeHtml(authError)}</p>` : ""}
        <button class="pill-btn full gold" type="submit">Anmelden</button>
      </form>
    </div>`;
}

function setPasswordScreen() {
  return `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;">
      <form data-action="set-password-form" style="background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius);padding:36px;width:340px;box-shadow:var(--shadow);">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:22px;">
          ${fullLockup({ height: 90 })}
          <div class="admin-brand-sub" style="color:var(--ink-soft);margin-top:2px;">Willkommen! Bitte Passwort festlegen</div>
        </div>
        <div class="plain-field"><label>Neues Passwort</label><input id="set-pw-1" type="password" autocomplete="new-password" minlength="8" required /></div>
        <div class="plain-field"><label>Passwort bestätigen</label><input id="set-pw-2" type="password" autocomplete="new-password" minlength="8" required /></div>
        ${setPasswordError ? `<p style="color:#a34a3a;font-size:13px;margin:-6px 0 14px;">${escapeHtml(setPasswordError)}</p>` : ""}
        <button class="pill-btn full gold" type="submit" ${setPasswordSubmitting ? "disabled" : ""}>${setPasswordSubmitting ? "Speichert …" : "Passwort speichern & loslegen"}</button>
      </form>
    </div>`;
}

function render() {
  if (!authChecked) return (root.innerHTML = loadingScreen());
  if (!session) return (root.innerHTML = loginScreen());
  if (pendingCredentialSetup) return (root.innerHTML = setPasswordScreen());
  if (!isReady()) return (root.innerHTML = loadingScreen());
  if (!canAccessPage(page)) page = "dashboard";
  root.innerHTML = sidebar() + `<div class="admin-main">${PAGES[page]()}</div>`;
  if (page === "postcard") hydratePostcardPage();
  if (page === "staff") hydrateStaffPage();
}

root.addEventListener("submit", async (e) => {
  const loginForm = e.target.closest('[data-action="login-form"]');
  if (loginForm) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    authError = "";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      authError = "E-Mail oder Passwort ist falsch.";
      render();
    }
    return;
  }

  const setPwForm = e.target.closest('[data-action="set-password-form"]');
  if (setPwForm) {
    e.preventDefault();
    const p1 = document.getElementById("set-pw-1").value;
    const p2 = document.getElementById("set-pw-2").value;
    setPasswordError = "";
    if (p1.length < 8) {
      setPasswordError = "Mindestens 8 Zeichen.";
      return render();
    }
    if (p1 !== p2) {
      setPasswordError = "Passwörter stimmen nicht überein.";
      return render();
    }
    setPasswordSubmitting = true;
    render();
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setPasswordSubmitting = false;
    if (error) {
      setPasswordError = error.message;
      return render();
    }
    pendingCredentialSetup = false;
    history.replaceState({}, "", location.pathname + location.search);
    return render();
  }

  const inviteForm = e.target.closest('[data-action="staff-invite-form"]');
  if (inviteForm) {
    e.preventDefault();
    const email = document.getElementById("staff-invite-email").value.trim();
    const role = document.getElementById("staff-invite-role").value;
    staffActionError = "";
    staffJustInvited = "";
    staffInviting = true;
    render();
    try {
      const redirectTo = new URL("admin.html", location.href).href;
      await callStaffFn("invite", { email, role, redirectTo });
      staffJustInvited = email;
      staffInviteEmail = "";
      staffInviteRole = "kitchen";
      await loadStaff();
    } catch (err) {
      staffActionError = err.message;
    }
    staffInviting = false;
    render();
  }
});

root.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  if (action === "logout") {
    await supabase.auth.signOut();
    return;
  }
  if (action === "enable-notifications") {
    return requestNotifPermission();
  }
  if (action === "toggle-mute") {
    return toggleNotifMute();
  }
  if (action === "print") {
    window.print();
    return;
  }
  if (action === "nav") {
    page = t.dataset.page;
    return render();
  }
  if (action === "advance-request") {
    setRequestItemStatus(t.dataset.id, t.dataset.next);
    return;
  }
  if (action === "staff-reset-pw") {
    return handleStaffResetPassword(t.dataset.email);
  }
  if (action === "staff-delete") {
    return handleStaffDelete(t.dataset.userId, t.dataset.email);
  }
  if (action === "translate") {
    return handleTranslate(t.dataset.basePath, t.dataset.multiline === "true");
  }
  if (action === "add-option") {
    const si = Number(t.dataset.si);
    const gi = Number(t.dataset.gi);
    const s = getState();
    const group = s.services[si].optionGroups[gi];
    group.options = group.options || [];
    group.options.push({
      value: crypto.randomUUID(),
      label: { de: "Neue Option", en: "New option", th: "ตัวเลือกใหม่" },
      ...(groupOptionsHaveOwnPrice(group) ? { price: 0 } : {}),
    });
    return commitServiceOptionGroups(si);
  }
  if (action === "remove-option") {
    const si = Number(t.dataset.si);
    const gi = Number(t.dataset.gi);
    const oi = Number(t.dataset.oi);
    const s = getState();
    s.services[si].optionGroups[gi].options.splice(oi, 1);
    return commitServiceOptionGroups(si);
  }
  if (action === "add-tip") {
    getState().content.localTips.push(BLANK_TIP());
    return commitLocalTips();
  }
  if (action === "remove-tip") {
    const idx = Number(t.dataset.index);
    getState().content.localTips.splice(idx, 1);
    return commitLocalTips();
  }
  if (action === "pc-set-room") {
    pcRoom = t.dataset.room;
    return render();
  }
  if (action === "pc-set-font") {
    pcFont = t.dataset.font;
    return render();
  }
  if (action === "pc-send") {
    const trimmed = pcText.trim();
    if (!trimmed) return;
    await addPostcard({ room: pcRoom, text: trimmed, font: pcFont });
    pcText = "";
    flash = true;
    render();
    setTimeout(() => {
      flash = false;
      document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
    }, 1400);
    return;
  }
});

root.addEventListener("input", (e) => {
  if (e.target.id === "pc-text") {
    pcText = e.target.value;
    updatePcPreview();
  }
});

root.addEventListener("change", (e) => {
  const roleSelect = e.target.closest('[data-action="staff-set-role"]');
  if (roleSelect) {
    return handleStaffSetRole(roleSelect.dataset.userId, roleSelect.value);
  }
  const fulfillmentInput = e.target.closest('[data-action="set-fulfillment"]');
  if (fulfillmentInput) {
    const id = fulfillmentInput.dataset.id;
    const current = getState().requestItems.find((i) => i.id === id)?.status || "in_pruefung";
    return setRequestItemStatus(id, current, fulfillmentInput.value);
  }
  const el = e.target.closest("[data-bind]");
  if (!el) return;
  const path = el.dataset.bind;
  let value = el.value;
  if (el.dataset.number === "true") value = parseFloat(value) || 0;
  else if (el.dataset.list === "true") value = value.split("\n").map((s) => s.trim()).filter(Boolean);
  else if (el.dataset.list === "comma") value = value.split(",").map((s) => s.trim()).filter(Boolean);
  commit(path, value);
});

// ---------- boot ----------
supabase.auth.getSession().then(({ data }) => {
  session = data.session;
  authChecked = true;
  render();
});
supabase.auth.onAuthStateChange((_event, newSession) => {
  session = newSession;
  render();
});
initStore();
subscribe(() => {
  if (page === "dashboard" || !isReady()) render();
});
render();
