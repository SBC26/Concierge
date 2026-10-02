import { tf } from "./i18n.js";
import {
  getState,
  subscribe,
  isReady,
  initStore,
  getRooms,
  addPostcard,
  deletePostcard,
  clearPostcards,
  updateHotelContent,
  updateRow,
  insertRow,
  deleteRow,
  mapService,
  updateBookingRow,
  updateRoomRow,
  getIdleMode,
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
let pcChannel = "postcard"; // "postcard" (guest tablet takeover) | "fallblatt" (lobby split-flap display)
let pcRoom = "all";
let pcFont = FONT_OPTIONS[0].id;
let pcText = "";
let pcFooter = null; // null = not yet initialized; lazily set to defaultPcFooter() on first render

// services-editor state: which cards are open, by service id (not index —
// indices shift on add/remove, ids don't).
let expandedServices = new Set();
// Same collapsed-by-default accordion pattern for Hotel-Infos (section id)
// and Buchungen (room name, stable across realtime re-fetches — unlike an
// array index) — both pages were a long wall of always-open fields.
let expandedInfoSections = new Set();
let expandedBookings = new Set();

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

// category is free text (the DB's old fixed CHECK constraint was dropped) —
// this is just a sensible starting value staff can overwrite right away.
// Multiple services may share one category; it's a classification/icon tag
// (CATEGORY_LABEL/CATEGORY_ICON, with a graceful fallback to the raw string
// for anything custom), not a unique key.
async function handleAddService() {
  const s = getState();
  const sortOrder = s.services.reduce((max, sv) => Math.max(max, sv.sortOrder ?? 0), 0) + 1;
  const row = await insertRow("services", {
    category: Object.keys(CATEGORY_LABEL)[0],
    name: { de: "Neuer Service", en: "New service", th: "บริการใหม่" },
    short_desc: { de: "", en: "", th: "" },
    from_price: null,
    option_groups: [],
    sort_order: sortOrder,
  });
  if (!row) return; // insertRow already logged the error
  s.services.push(mapService(row));
  render();
}

async function handleRemoveService(si) {
  const s = getState();
  const row = s.services[si];
  if (!row) return;
  if (!confirm(`„${tf(row.name, "de")}" wirklich löschen? Das entfernt den Service dauerhaft aus dem Gästeportal.`)) return;
  s.services.splice(si, 1);
  expandedServices.delete(row.id);
  render();
  await deleteRow("services", row.id);
}

// Switching price mode also clears the fields the other modes don't use, so
// a service can't end up simultaneously "on request" and carrying a stale
// numeric price from before the switch.
async function handleSetPriceMode(si, mode) {
  const s = getState();
  const row = s.services[si];
  if (!row) return;
  if (mode === "price") {
    row.priceOnRequest = false;
    if (row.fromPrice == null) row.fromPrice = 0;
  } else if (mode === "inclusive") {
    row.priceOnRequest = false;
    row.fromPrice = null;
  } else if (mode === "onRequest") {
    row.priceOnRequest = true;
    row.fromPrice = null;
  }
  flash = true;
  render();
  setTimeout(() => {
    flash = false;
    document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
  }, 1400);
  await updateRow("services", row.id, { price_on_request: row.priceOnRequest, from_price: row.fromPrice });
}

// A brand-new service starts with optionGroups: [] — until now there was no
// way to add the first one, so a freshly created service had no way to ask
// the guest for anything beyond what's already on the card (name/price).
function handleAddOptionGroup(si) {
  const s = getState();
  const service = s.services[si];
  if (!service) return;
  service.optionGroups = service.optionGroups || [];
  service.optionGroups.push({
    key: `feld${service.optionGroups.length + 1}`,
    type: "text",
    label: { de: "Neues Feld", en: "New field", th: "ฟิลด์ใหม่" },
    options: [],
  });
  return commitServiceOptionGroups(si);
}

function handleRemoveOptionGroup(si, gi) {
  const s = getState();
  const group = s.services[si]?.optionGroups[gi];
  if (!group) return;
  if (!confirm(`Feld „${group.key}" wirklich löschen?`)) return;
  s.services[si].optionGroups.splice(gi, 1);
  return commitServiceOptionGroups(si);
}

// Free reordering of the guest-facing service tiles. Renumbers every
// service's sort_order sequentially from the new array order rather than
// swapping just the two moved rows' values — robust regardless of whatever
// sort_order values already existed (ties, gaps, …), at the cost of writing
// every row on each move, which is cheap at this catalog's size (a dozen
// services, not hundreds).
async function handleMoveService(si, dir) {
  const s = getState();
  const otherIndex = si + dir;
  if (otherIndex < 0 || otherIndex >= s.services.length) return;
  const arr = s.services;
  [arr[si], arr[otherIndex]] = [arr[otherIndex], arr[si]];
  arr.forEach((sv, i) => { sv.sortOrder = i; });
  render();
  await Promise.all(arr.map((sv, i) => updateRow("services", sv.id, { sort_order: i })));
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
    ...(fullAccess ? [{ id: "postcard", icon: "mail", label: "Mitteilung senden" }] : []),
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
        <span class="footer-hint">Änderungen werden sofort auf allen geöffneten Zimmer-Tablets angezeigt.</span>
        <div class="footer-account" style="margin-top:10px;">
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
const PRICE_MODES = [
  { id: "price", icon: "banknote", label: "Preis" },
  { id: "inclusive", icon: "check", label: "Inklusive" },
  { id: "onRequest", icon: "circleHelp", label: "Auf Anfrage" },
];
// Icons offered per option in a choice-list (shown left of the label on the
// guest's service screen). Keys must exist in js/icons.js; "" = no icon.
const OPTION_ICON_CHOICES = [
  { id: "", label: "Kein Icon" },
  { id: "bed", label: "Bett" },
  { id: "brushCleaning", label: "Reinigung" },
  { id: "droplets", label: "Wasser / Handtücher" },
  { id: "shirt", label: "Wäsche" },
  { id: "sparkles", label: "Besonderes" },
  { id: "moon", label: "Nacht" },
  { id: "sunrise", label: "Morgen" },
  { id: "utensils", label: "Essen" },
  { id: "utensilsCrossed", label: "Restaurant" },
  { id: "flower2", label: "Wellness" },
  { id: "carTaxiFront", label: "Fahrzeug" },
  { id: "doorOpen", label: "Zugang" },
  { id: "keyRound", label: "Schlüssel" },
  { id: "bell", label: "Service / Klingel" },
  { id: "shoppingBag", label: "Einkauf" },
  { id: "mapPin", label: "Ort" },
  { id: "users", label: "Personen" },
  { id: "clock", label: "Zeit" },
  { id: "phoneCall", label: "Anruf" },
  { id: "circleHelp", label: "Sonstiges" },
];

// The set of option-group types js/views/shared.js's renderOptionGroup() /
// serviceDetail.js actually know how to render and collect a value for —
// keep in sync with that if a new type is ever added there.
const GROUP_TYPES = [
  { id: "text", label: "Text" },
  { id: "segmented", label: "Auswahl (Buttons)" },
  { id: "choice-list", label: "Auswahl-Liste" },
  { id: "stepper", label: "Zähler (+/-)" },
  { id: "date", label: "Datum" },
  { id: "time", label: "Uhrzeit" },
  { id: "datetime", label: "Datum & Uhrzeit" },
];

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
      <div class="meta">${fmtTime(item.createdAt)}${item.price != null ? ` · THB ${item.price.toFixed(0)}` : ""}</div>
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

function defaultPcFooter() {
  const saved = getState().content.postcardFooterDefault;
  if (saved) return saved;
  const recipientLabel = pcRoom === "all" ? "Alle Zimmer" : "Zimmer " + pcRoom;
  return `Mit herzlichen Grüssen aus dem Swiss Baan Chiang · ${recipientLabel} · ${fmtDate(Date.now())}`;
}

// Preview-only word-wrap mirroring js/views/idle.js's wrapMessage() (16 chars ×
// 4 lines) — duplicated rather than imported since it's purely cosmetic here
// (the backoffice never renders the actual board), kept in sync by hand.
function wrapForPreview(text, lineLen = 16, maxLines = 4) {
  const words = (text || "").toUpperCase().trim().split(/\s+/).filter(Boolean).map((w) => (w.length > lineLen ? w.slice(0, lineLen) : w));
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= lineLen) cur = next;
    else {
      lines.push(cur);
      cur = word;
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

const PC_CHANNELS = [
  { id: "postcard", icon: "mail", label: "Postkarte", hint: "Postkarte — erscheint als Ruhebildschirm auf dem Zimmer-Tablet, bis eine neue gesendet wird (nur für Villen mit Startseite „Postkarte“)." },
  { id: "fallblatt", icon: "monitor", label: "Fallblattanzeige", hint: "Fallblattanzeige — reiht sich als eigene Seite in die Rotation des Ruhebildschirms ein (max. 4 Zeilen à 16 Zeichen, nur für Villen mit Startseite „Fallblattanzeige“)." },
];

function viewPostcard() {
  const s = getState();
  const sent = [...s.postcards].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const recipientLabel = pcRoom === "all" ? "Alle Zimmer" : "Zimmer " + pcRoom;
  const isFallblatt = pcChannel === "fallblatt";
  if (pcFooter === null) pcFooter = defaultPcFooter();
  return `
    ${topHeader("Mitteilung senden", "Eine Nachricht an die Postkarte oder die Fallblattanzeige im Eingang schicken")}

    <div class="editor-section">
      <h3>Kanal</h3>
      <div class="font-swatches">
        ${PC_CHANNELS.map(
          (c) => `
          <button class="font-swatch ${pcChannel === c.id ? "active" : ""}" data-action="pc-set-channel" data-channel="${c.id}" style="min-width:150px;">
            <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon(c.icon, { size: 18 })}</div><div class="label">${c.label}</div>
          </button>`
        ).join("")}
      </div>
      <p class="rules-hint">${PC_CHANNELS.find((c) => c.id === pcChannel).hint}</p>
      ${
        isFallblatt
          ? `<div class="plain-field" style="margin-top:12px;max-width:200px;">
        <label>Anzeigedauer pro Seite (Sek.)</label>
        <input type="number" min="2" max="60" value="${s.content.fallblattPageSeconds}" data-bind="content.fallblattPageSeconds" data-number="true" style="width:100%;background:var(--sbc-wattblau);border:1px solid var(--line);color:var(--sbc-sand);border-radius:var(--radius-btn);padding:8px 10px;font-size:13px;font-family:inherit;" />
        <p class="rules-hint">Gilt für alle Seiten der Fallblattanzeige (Buchungsinfo + aktive Mitteilungen).</p>
      </div>`
          : ""
      }
    </div>

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
      ${
        pcRoom !== "all" && getIdleMode(pcRoom) !== pcChannel
          ? `<div style="margin-top:14px;padding:12px 14px;border:1px solid #a34a3a;border-radius:8px;background:rgba(163,74,58,0.1);">
              <p style="color:#a34a3a;font-size:13px;line-height:1.5;">
                Hinweis: ${escapeHtml(pcRoom)} zeigt als Startseite aktuell „${getIdleMode(pcRoom) === "fallblatt" ? "Fallblattanzeige" : "Postkarte"}" — diese Mitteilung erscheint dort erst, wenn du die Startseite umstellst.
              </p>
              <button class="translate-btn" data-action="set-idle-mode" data-room="${escapeHtml(pcRoom)}" data-mode="${pcChannel}" style="margin-top:8px;">
                ${icon("check", { size: 12 })} Startseite von ${escapeHtml(pcRoom)} auf „${isFallblatt ? "Fallblattanzeige" : "Postkarte"}" umstellen
              </button>
            </div>`
          : ""
      }
    </div>

    <div class="editor-section">
      <h3>Vorschau &amp; Nachricht</h3>
      ${
        isFallblatt
          ? `<div id="pc-fb-preview" style="background:var(--sbc-wattblau-deep);border:1px solid var(--line);border-radius:8px;padding:18px;font-family:var(--font-display);font-size:20px;letter-spacing:0.04em;color:var(--sbc-gold-bright);text-align:center;line-height:1.9;white-space:pre;">${escapeHtml(wrapForPreview(pcText).join("\n") || "So erscheint deine Mitteilung auf der Fallblattanzeige …")}</div>`
          : postcardHTML({
              idPrefix: "pc",
              message: pcText,
              fontId: pcFont,
              placeholder: "So erscheint deine Postkarte auf dem Gästegerät …",
              footerHtml: escapeHtml(pcFooter),
            })
      }

      ${
        isFallblatt
          ? ""
          : `<div class="plain-field" style="margin-top:16px;"><label>Schriftart</label></div>
      <div class="font-swatches">
        ${FONT_OPTIONS.map(
          (f) => `
          <button class="font-swatch ${f.id === pcFont ? "active" : ""}" data-action="pc-set-font" data-font="${f.id}">
            <div class="sample" style="font-family:${f.family};">Aa</div>
            <div class="label">${f.label}</div>
          </button>`
        ).join("")}
      </div>`
      }

      <textarea id="pc-text" rows="4" placeholder="${isFallblatt ? "Mitteilung eingeben … (max. 4 Zeilen à 16 Zeichen)" : "Nachricht eingeben …"}" style="width:100%;margin-top:16px;border:1px solid var(--line);border-radius:8px;padding:11px 13px;font-size:14px;font-family:inherit;"></textarea>

      ${
        isFallblatt
          ? ""
          : `<div class="ml-label-row" style="margin-top:14px;">
        <label>Grusszeile (Fusszeile der Postkarte)</label>
        <button class="translate-btn" data-action="pc-save-footer">${icon("check", { size: 12 })} Als Standard speichern</button>
      </div>
      <input id="pc-footer-input" placeholder="Mit herzlichen Grüssen …" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px 13px;font-size:13px;font-family:inherit;" />
      <p class="rules-hint">Wird ab sofort als Vorschlag für jede neue Postkarte verwendet, bis du sie erneut speicherst.</p>`
      }

      <button class="pill-btn full gold" id="pc-send-btn" data-action="pc-send" ${pcText.trim() ? "" : "disabled"} style="margin-top:14px;">${isFallblatt ? "Mitteilung" : "Postkarte"} an ${escapeHtml(recipientLabel)} senden</button>
    </div>

    <div class="editor-section">
      <div class="row-between" style="margin-bottom:14px;">
        <h3 style="margin-bottom:0;">Zuletzt gesendet</h3>
        ${
          canManageStaff() && sent.length
            ? `<button class="translate-btn" data-action="pc-clear-all">${icon("trash2", { size: 12 })} Liste löschen</button>`
            : ""
        }
      </div>
      ${
        sent.length === 0
          ? `<p class="muted" style="font-size:13px;">Noch keine Mitteilung gesendet.</p>`
          : sent
              .map(
                (p) => `
          <div class="order-chip">
            <div class="row-between">
              <span class="room-tag">${p.room === "all" ? "Alle Zimmer" : "Zi. " + escapeHtml(p.room)}</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="type-tag">${p.channel === "fallblatt" ? icon("monitor", { size: 12 }) + " Fallblatt" : icon("mail", { size: 12 }) + " Postkarte"}</span>
                <span class="type-tag">${fmtTime(p.createdAt)}</span>
                <button class="remove-btn" data-action="pc-delete" data-id="${p.id}" title="Löschen / Rückgängig machen">${icon("x", { size: 13 })}</button>
              </div>
            </div>
            <div class="note" style="margin-top:4px;">${escapeHtml(p.text)}</div>
          </div>`
              )
              .join("")
      }
    </div>`;
}

function updatePcPreview() {
  const trimmed = pcText.trim();
  const btn = document.getElementById("pc-send-btn");
  if (btn) btn.disabled = !trimmed;

  const fbPreview = document.getElementById("pc-fb-preview");
  if (fbPreview) {
    fbPreview.textContent = wrapForPreview(pcText).join("\n") || "So erscheint deine Mitteilung auf der Fallblattanzeige …";
    return;
  }

  const msg = document.getElementById("pc-message");
  if (!msg) return;
  if (trimmed) {
    msg.textContent = pcText;
    msg.classList.remove("placeholder");
    msg.style.fontFamily = FONT_OPTIONS.find((f) => f.id === pcFont)?.family || "";
  } else {
    msg.textContent = "So erscheint deine Postkarte auf dem Gästegerät …";
    msg.classList.add("placeholder");
  }
  const foot = document.getElementById("pc-footer");
  if (foot) foot.textContent = pcFooter;
}

function hydratePostcardPage() {
  const ta = document.getElementById("pc-text");
  if (ta) ta.value = pcText;
  const fo = document.getElementById("pc-footer-input");
  if (fo) fo.value = pcFooter;
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

// Collapsed-by-default accordion, same pattern and CSS classes as the
// Services editor (serviceCard()) — Hotel-Infos was six always-open sections
// (WLAN, Concierge/Notfall, Öffnungszeiten, Willkommenstext, Hausregeln,
// Ausflugstipps) stacked on one page, most of which staff only ever glance
// at or touch once. Reusing .service-card* here isn't service-specific
// styling, it's just this admin's one accordion-card look.
function infoSectionCard(id, iconName, title, summary, bodyHtml) {
  const expanded = expandedInfoSections.has(id);
  return `
    <div class="editor-section service-card ${expanded ? "expanded" : ""}">
      <div class="service-card-header" data-action="toggle-info-section" data-id="${id}">
        <span class="service-card-icon">${icon(iconName, { size: 16 })}</span>
        <span class="service-card-name">${escapeHtml(title)}</span>
        ${summary ? `<span class="service-card-price">${escapeHtml(summary)}</span>` : ""}
        <span class="service-card-chevron">${icon("chevronDown", { size: 16 })}</span>
      </div>
      ${expanded ? `<div class="service-card-body">${bodyHtml}</div>` : ""}
    </div>`;
}

function viewInfo() {
  const c = getState().content;
  const ruleCount = ["de", "en", "th"].reduce((n, code) => n + (c.rules[code]?.length || 0), 0);
  return `
    ${topHeader("Hotel-Infos", "Diese Angaben sehen Gäste unter „Hotelinfo“")}
    ${infoSectionCard("wifi", "wifi", "WLAN & Rezeption", c.wifiSsid, `
      <div class="editor-grid">
        <div class="plain-field"><label>WLAN-Netzwerk</label><input value="${escapeAttr(c.wifiSsid)}" data-bind="content.wifiSsid" /></div>
        <div class="plain-field"><label>WLAN-Passwort</label><input value="${escapeAttr(c.wifiPassword)}" data-bind="content.wifiPassword" /></div>
        <div class="plain-field"><label>Rezeption Telefon</label><input value="${escapeAttr(c.receptionPhone)}" data-bind="content.receptionPhone" /></div>
      </div>
    `)}
    ${infoSectionCard("concierge", "phoneCall", "Concierge & Notfall", c.conciergeName, `
      <p class="rules-hint" style="margin-top:-6px;margin-bottom:10px;">Für „Direkt schreiben" und „Im Notfall" im Gäste-Portal.</p>
      <div class="editor-grid">
        <div class="plain-field"><label>Concierge-Name</label><input value="${escapeAttr(c.conciergeName)}" data-bind="content.conciergeName" /></div>
        <div class="plain-field"><label>Concierge WhatsApp-Nummer</label><input value="${escapeAttr(c.conciergePhone)}" data-bind="content.conciergePhone" placeholder="+66812345678" /></div>
        <div class="plain-field"><label>Spital (Name &amp; Distanz)</label><input value="${escapeAttr(c.emergencyHospital)}" data-bind="content.emergencyHospital" /></div>
        <div class="plain-field"><label>Notrufnummer</label><input value="${escapeAttr(c.emergencyNumber)}" data-bind="content.emergencyNumber" /></div>
      </div>
    `)}
    ${infoSectionCard("hours", "clock", "Öffnungszeiten", "", `
      <div class="editor-grid cols-3">
        <div class="plain-field"><label>Frühstück</label><input value="${escapeAttr(c.breakfastHours)}" data-bind="content.breakfastHours" /></div>
        <div class="plain-field"><label>Restaurant</label><input value="${escapeAttr(c.restaurantHours)}" data-bind="content.restaurantHours" /></div>
        <div class="plain-field"><label>Spa</label><input value="${escapeAttr(c.spaHours)}" data-bind="content.spaHours" /></div>
        <div class="plain-field"><label>Check-in</label><input value="${escapeAttr(c.checkin)}" data-bind="content.checkin" /></div>
        <div class="plain-field"><label>Check-out</label><input value="${escapeAttr(c.checkout)}" data-bind="content.checkout" /></div>
      </div>
    `)}
    ${infoSectionCard("welcome", "mail", "Willkommenstext", "", triLang("", "content.welcome", true))}
    ${infoSectionCard("rules", "scrollText", "Hausregeln", ruleCount ? `${ruleCount} Regeln` : "", `
      <p class="rules-hint" style="margin-top:-6px;margin-bottom:10px;">Eine Regel pro Zeile.</p>
      <div class="editor-grid cols-3">
        ${["de", "en", "th"]
          .map((code) => {
            const val = (c.rules[code] || []).join("\n");
            return `<div class="ml-field"><span class="lang-tag">${code.toUpperCase()}</span><textarea data-bind="content.rules.${code}" data-list="true" style="min-height:110px;">${val}</textarea></div>`;
          })
          .join("")}
      </div>
    `)}
    ${infoSectionCard("tips", "mapPin", "Ausflugstipps", c.localTips.length ? `${c.localTips.length} Tipps` : "", `
      ${c.localTips
        .map(
          (tip, i) => `
        <div class="item-editor-row">
          <div class="row-top">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:var(--copper);display:flex;">${icon(tip.icon, { size: 18 })}</span>
              <select data-bind="content.localTips.${i}.icon" style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px;">
                ${TIP_ICON_CHOICES.map((tc) => `<option value="${tc.id}" ${tc.id === tip.icon ? "selected" : ""}>${tc.label}</option>`).join("")}
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
    `)}
  `;
}

// ---------- SERVICES EDITOR (unified catalog, free-text category) ----------
// Each service's own option groups drive the guest-facing Service-Detail
// screen. Staff can edit name/description/price and, for choice-driven groups
// (segmented/choice-list), add or remove the individual options — the group
// structure itself (which categories have which groups) is fixed by design,
// mirrored from the mockups, so it isn't editable here.
function servicePriceMode(sv) {
  if (sv.priceOnRequest) return "onRequest";
  if (sv.fromPrice == null) return "inclusive";
  return "price";
}

// Same three-way mode as servicePriceMode(), but per option within a
// segmented/choice-list group's own options list (e.g. one "Fahrzeug" choice
// costs a fixed price, another is included, another only "auf Anfrage").
function optionPriceMode(opt) {
  if (opt.priceOnRequest) return "onRequest";
  if (opt.price == null) return "inclusive";
  return "price";
}

function servicePriceSummary(sv) {
  if (sv.priceOnRequest) return "Auf Anfrage";
  if (sv.fromPrice == null) return "Inklusive";
  return `ab THB ${Math.round(sv.fromPrice)}${sv.priceUnit ? ` / ${sv.priceUnit}` : ""}`;
}

// Collapsed-by-default accordion: with 9+ services each carrying a full
// name/desc/category/price/option-groups form, showing all of them open at
// once was an overwhelming wall of fields — staff now see just an icon,
// name and price per row, and open only the one they came to edit.
function viewServices() {
  const s = getState();
  return `
    ${topHeader("Services", "Der Servicekatalog, den Gäste im Portal durchstöbern und anfragen")}
    ${s.services.map((sv, si) => serviceCard(sv, si, expandedServices.has(sv.id), s.services.length)).join("")}
    <button class="add-btn" data-action="add-service">+ Service hinzufügen</button>
    <datalist id="category-suggestions">
      ${Object.entries(CATEGORY_LABEL).map(([val, label]) => `<option value="${val}">${escapeHtml(label)}</option>`).join("")}
    </datalist>`;
}

function serviceCard(sv, si, expanded, total) {
  return `
    <div class="editor-section service-card ${expanded ? "expanded" : ""}">
      <div class="service-card-header" data-action="toggle-service" data-si="${si}">
        <span class="service-card-icon">${icon(CATEGORY_ICON[sv.category] || "sparkles", { size: 16 })}</span>
        <span class="service-card-name">${escapeHtml(tf(sv.name, "de")) || "(ohne Namen)"}</span>
        <span class="service-card-price">${escapeHtml(servicePriceSummary(sv))}</span>
        <div class="service-card-move">
          <button class="move-btn" data-action="move-service" data-si="${si}" data-dir="-1" title="Nach oben" ${si === 0 ? "disabled" : ""}>${icon("chevronUp", { size: 12 })}</button>
          <button class="move-btn" data-action="move-service" data-si="${si}" data-dir="1" title="Nach unten" ${si === total - 1 ? "disabled" : ""}>${icon("chevronDown", { size: 12 })}</button>
        </div>
        <button class="remove-btn" data-action="remove-service" data-si="${si}" title="Service löschen">${icon("x", { size: 13 })}</button>
        <span class="service-card-chevron">${icon("chevronDown", { size: 16 })}</span>
      </div>
      ${expanded ? `
      <div class="service-card-body">
        ${triLang("Name", `services.${si}.name`)}
        ${triLang("Kurzbeschreibung", `services.${si}.shortDesc`)}
        <div class="num-row">
          <div class="field-mini">
            <label>Kategorie</label>
            <input value="${escapeAttr(sv.category)}" data-bind="services.${si}.category" list="category-suggestions" />
            <p class="rules-hint" style="margin-top:4px;">Freier Text — bestehende Kategorien als Vorschlag, oder eine neue eintippen (z. B. „babysitting").</p>
          </div>
        </div>
        <div class="plain-field">
          <label>Preis</label>
          <div class="font-swatches">
            ${PRICE_MODES.map(
              (m) => `
              <button class="font-swatch ${servicePriceMode(sv) === m.id ? "active" : ""}" data-action="set-price-mode" data-si="${si}" data-mode="${m.id}">
                <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon(m.icon, { size: 16 })}</div><div class="label">${m.label}</div>
              </button>`
            ).join("")}
          </div>
        </div>
        ${servicePriceMode(sv) === "price" ? `
        <div class="num-row">
          <div class="field-mini">
            <label>Ab-Preis (THB)</label>
            <input type="number" step="1" value="${sv.fromPrice ?? ""}" data-bind="services.${si}.fromPrice" data-number="true" />
          </div>
          <div class="field-mini"><label>Preiseinheit (optional, z. B. „Tag")</label><input value="${escapeAttr(sv.priceUnit || "")}" data-bind="services.${si}.priceUnit" /></div>
        </div>` : ""}
        <div class="plain-field" style="margin-top:6px;">
          <label>Felder (was der Gast ausfüllt)</label>
        </div>
        ${sv.optionGroups.map((g, gi) => optionGroupEditor(sv, si, g, gi)).join("")}
        <button class="add-btn" data-action="add-group" data-si="${si}">+ Feld hinzufügen</button>
      </div>` : ""}
    </div>`;
}

function optionGroupEditor(service, si, group, gi) {
  const hasOptions = group.type === "segmented" || group.type === "choice-list";
  return `
    <div class="item-editor-row" style="background:rgba(191,166,114,0.06);">
      <div class="row-top">
        <span class="muted">Feld ${gi + 1}</span>
        <button class="remove-btn" data-action="remove-group" data-si="${si}" data-gi="${gi}" title="Feld löschen">${icon("x", { size: 13 })}</button>
      </div>
      <div class="num-row">
        <div class="field-mini">
          <label>Schlüssel</label>
          <input value="${escapeAttr(group.key)}" data-bind="services.${si}.optionGroups.${gi}.key" />
        </div>
        <div class="field-mini">
          <label>Typ</label>
          <select data-bind="services.${si}.optionGroups.${gi}.type">
            ${GROUP_TYPES.map((gt) => `<option value="${gt.id}" ${group.type === gt.id ? "selected" : ""}>${escapeHtml(gt.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <p class="rules-hint" style="margin-top:4px;">Schlüssel ist ein interner Bezeichner (z. B. „richtung"), für Gäste nicht sichtbar.</p>
      ${triLang("Feldbezeichnung", `services.${si}.optionGroups.${gi}.label`)}
      <div class="plain-field">
        <label>Pflichtfeld</label>
        <div class="font-swatches">
          <button class="font-swatch ${!group.required ? "active" : ""}" data-action="set-group-required" data-si="${si}" data-gi="${gi}" data-value="false"><div class="label">Optional</div></button>
          <button class="font-swatch ${group.required ? "active" : ""}" data-action="set-group-required" data-si="${si}" data-gi="${gi}" data-value="true"><div class="label">Pflichtfeld</div></button>
        </div>
        <p class="rules-hint" style="margin-top:4px;">Pflichtfeld: Gast muss hier etwas erfassen, um die Anfrage abschicken zu können.</p>
      </div>
      ${group.type === "text" ? `
      <div class="plain-field">
        <label>Eingabeart</label>
        <div class="font-swatches">
          <button class="font-swatch ${!group.multiline ? "active" : ""}" data-action="set-group-multiline" data-si="${si}" data-gi="${gi}" data-value="false"><div class="label">Einzeilig</div></button>
          <button class="font-swatch ${group.multiline ? "active" : ""}" data-action="set-group-multiline" data-si="${si}" data-gi="${gi}" data-value="true"><div class="label">Mehrzeilig</div></button>
        </div>
      </div>` : ""}
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
              ${group.type === "choice-list" ? `
              <div class="num-row" style="margin-bottom:14px;">
                <div class="field-mini">
                  <label>Icon</label>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span style="color:var(--copper);display:flex;width:20px;justify-content:center;">${opt.icon ? icon(opt.icon, { size: 18 }) : ""}</span>
                    <select data-bind="services.${si}.optionGroups.${gi}.options.${oi}.icon">
                      ${OPTION_ICON_CHOICES.map((ic) => `<option value="${ic.id}" ${(opt.icon || "") === ic.id ? "selected" : ""}>${ic.label}</option>`).join("")}
                    </select>
                  </div>
                </div>
              </div>` : ""}
              <div class="plain-field" style="margin-bottom:0;">
                <label>Preis</label>
                <div class="font-swatches">
                  ${PRICE_MODES.map(
                    (m) => `
                    <button class="font-swatch ${optionPriceMode(opt) === m.id ? "active" : ""}" data-action="set-option-price-mode" data-si="${si}" data-gi="${gi}" data-oi="${oi}" data-mode="${m.id}">
                      <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon(m.icon, { size: 14 })}</div><div class="label">${m.label}</div>
                    </button>`
                  ).join("")}
                </div>
              </div>
              ${
                optionPriceMode(opt) === "price"
                  ? `<div class="num-row"><div class="field-mini"><label>Preis (THB)</label><input type="number" step="1" value="${opt.price ?? 0}" data-bind="services.${si}.optionGroups.${gi}.options.${oi}.price" data-number="true" /></div></div>`
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
function fmtBookingRange(b) {
  if (!b.arrival || !b.departure) return "";
  const short = (d) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.`;
  };
  return `${short(b.arrival)}–${short(b.departure)}`;
}

// Same collapsed-by-default accordion as Services/Hotel-Infos — five villas
// each with ~15 fields was a very long page to scroll past just to find one.
function bookingCard(b, i, expanded) {
  const summary = [b.guestName, fmtBookingRange(b)].filter(Boolean).join(" · ");
  return `
    <div class="editor-section service-card ${expanded ? "expanded" : ""}">
      <div class="service-card-header" data-action="toggle-booking" data-room="${escapeAttr(b.room)}">
        <span class="service-card-icon">${icon("bed", { size: 16 })}</span>
        <span class="service-card-name">${escapeHtml(b.room)}</span>
        ${summary ? `<span class="service-card-price">${escapeHtml(summary)}</span>` : ""}
        <span class="service-card-chevron">${icon("chevronDown", { size: 16 })}</span>
      </div>
      ${expanded ? `
      <div class="service-card-body">
        <div class="plain-field">
          <label>Startseite dieses Tablets</label>
          <div class="font-swatches">
            <button class="font-swatch ${getIdleMode(b.room) === "postcard" ? "active" : ""}" data-action="set-idle-mode" data-room="${escapeHtml(b.room)}" data-mode="postcard" style="min-width:130px;">
              <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon("mail", { size: 18 })}</div><div class="label">Postkarte</div>
            </button>
            <button class="font-swatch ${getIdleMode(b.room) === "fallblatt" ? "active" : ""}" data-action="set-idle-mode" data-room="${escapeHtml(b.room)}" data-mode="fallblatt" style="min-width:150px;">
              <div class="sample" style="display:flex;justify-content:center;color:var(--copper);">${icon("monitor", { size: 18 })}</div><div class="label">Fallblattanzeige</div>
            </button>
          </div>
          <p class="rules-hint">Ruhebildschirm, der beim Laden und nach 30 Sek. Inaktivität auf diesem Zimmer-Tablet erscheint.</p>
        </div>
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
      </div>` : ""}
    </div>`;
}

function viewBookings() {
  const s = getState();
  return `
    ${topHeader("Buchungen", "Die aktuelle Buchung je Villa — das sehen Gäste unter „Deine Buchung“")}
    ${s.bookings.map((b, i) => bookingCard(b, i, expandedBookings.has(b.room))).join("")}`;
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
          : staffGroupsHtml(staffList || []) || `<p class="muted">Keine Konten gefunden.</p>`
      }
    </div>`;
}

// Accounts grouped by role, in ROLE_OPTIONS order (staffList is already
// sorted by e-mail, so each group stays alphabetical). A role not in
// ROLE_OPTIONS still shows up, in a trailing "Sonstige" group, rather than
// silently vanishing from the page.
function staffGroupsHtml(list) {
  const known = new Set(ROLE_OPTIONS.map((r) => r.id));
  const groups = ROLE_OPTIONS.map((r) => ({ label: r.label, users: list.filter((u) => u.role === r.id) }));
  groups.push({ label: "Sonstige", users: list.filter((u) => !known.has(u.role)) });
  return groups
    .filter((g) => g.users.length)
    .map(
      (g) => `
      <div class="staff-group">
        <div class="staff-group-title">${escapeHtml(g.label)} <span class="kanban-count">${g.users.length}</span></div>
        ${g.users.map((u) => staffRow(u)).join("")}
      </div>`
    )
    .join("");
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
  if (action === "set-option-price-mode") {
    const si = Number(t.dataset.si);
    const gi = Number(t.dataset.gi);
    const oi = Number(t.dataset.oi);
    const s = getState();
    const opt = s.services[si]?.optionGroups[gi]?.options[oi];
    if (!opt) return;
    const mode = t.dataset.mode;
    if (mode === "price") {
      opt.priceOnRequest = false;
      if (opt.price == null) opt.price = 0;
    } else if (mode === "inclusive") {
      opt.priceOnRequest = false;
      opt.price = null;
    } else if (mode === "onRequest") {
      opt.priceOnRequest = true;
      opt.price = null;
    }
    return commitServiceOptionGroups(si);
  }
  if (action === "add-service") {
    return handleAddService();
  }
  if (action === "remove-service") {
    return handleRemoveService(Number(t.dataset.si));
  }
  if (action === "toggle-service") {
    const id = getState().services[Number(t.dataset.si)]?.id;
    if (!id) return;
    if (expandedServices.has(id)) expandedServices.delete(id);
    else expandedServices.add(id);
    return render();
  }
  if (action === "toggle-info-section") {
    const id = t.dataset.id;
    if (expandedInfoSections.has(id)) expandedInfoSections.delete(id);
    else expandedInfoSections.add(id);
    return render();
  }
  if (action === "toggle-booking") {
    const room = t.dataset.room;
    if (expandedBookings.has(room)) expandedBookings.delete(room);
    else expandedBookings.add(room);
    return render();
  }
  if (action === "set-price-mode") {
    return handleSetPriceMode(Number(t.dataset.si), t.dataset.mode);
  }
  if (action === "add-group") {
    return handleAddOptionGroup(Number(t.dataset.si));
  }
  if (action === "move-service") {
    return handleMoveService(Number(t.dataset.si), Number(t.dataset.dir));
  }
  if (action === "remove-group") {
    return handleRemoveOptionGroup(Number(t.dataset.si), Number(t.dataset.gi));
  }
  if (action === "set-group-multiline") {
    const si = Number(t.dataset.si);
    const gi = Number(t.dataset.gi);
    const group = getState().services[si]?.optionGroups[gi];
    if (!group) return;
    group.multiline = t.dataset.value === "true";
    return commitServiceOptionGroups(si);
  }
  if (action === "set-group-required") {
    const si = Number(t.dataset.si);
    const gi = Number(t.dataset.gi);
    const group = getState().services[si]?.optionGroups[gi];
    if (!group) return;
    group.required = t.dataset.value === "true";
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
  if (action === "set-idle-mode") {
    const roomName = t.dataset.room;
    const mode = t.dataset.mode;
    getState().roomSettings[roomName] = { idleMode: mode };
    flash = true;
    render();
    setTimeout(() => {
      flash = false;
      document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
    }, 1400);
    await updateRoomRow(roomName, { idle_mode: mode });
    return;
  }
  if (action === "pc-set-channel") {
    pcChannel = t.dataset.channel;
    return render();
  }
  if (action === "pc-set-room") {
    pcRoom = t.dataset.room;
    pcFooter = defaultPcFooter();
    return render();
  }
  if (action === "pc-set-font") {
    pcFont = t.dataset.font;
    return render();
  }
  if (action === "pc-send") {
    const trimmed = pcText.trim();
    if (!trimmed) return;
    await addPostcard({ room: pcRoom, text: trimmed, channel: pcChannel, font: pcFont, footer: pcFooter.trim() });
    pcText = "";
    pcFooter = defaultPcFooter();
    flash = true;
    render();
    setTimeout(() => {
      flash = false;
      document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
    }, 1400);
    return;
  }
  if (action === "pc-save-footer") {
    const val = pcFooter.trim();
    getState().content.postcardFooterDefault = val;
    flash = true;
    render();
    setTimeout(() => {
      flash = false;
      document.querySelectorAll(".save-flash").forEach((el) => el.classList.remove("show"));
    }, 1400);
    await updateHotelContent({ postcard_footer_default: val || null });
    return;
  }
  if (action === "pc-delete") {
    await deletePostcard(t.dataset.id);
    return render();
  }
  if (action === "pc-clear-all") {
    if (!confirm("Die gesamte Liste „Zuletzt gesendet“ wirklich unwiderruflich löschen?")) return;
    await clearPostcards();
    return render();
  }
});

root.addEventListener("input", (e) => {
  if (e.target.id === "pc-text") {
    pcText = e.target.value;
    updatePcPreview();
  }
  if (e.target.id === "pc-footer-input") {
    pcFooter = e.target.value;
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
