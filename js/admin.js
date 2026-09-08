import { tf } from "./i18n.js";
import {
  getState,
  subscribe,
  isReady,
  initStore,
  setOrderStatus,
  getRooms,
  addPostcard,
  updateHotelContent,
  updateRow,
  insertRow,
  deleteRow,
  mapMenuItem,
  mapSpaService,
  mapTaxiOption,
  mapExcursion,
} from "./store.js";
import { escapeHtml, FONT_OPTIONS, postcardHTML } from "./util.js";
import { icon } from "./icons.js";
import { vaseLogo } from "./logo.js";
import { supabase } from "./supabaseClient.js";

const root = document.getElementById("admin");
let page = "dashboard"; // dashboard | postcard | info | dining | spa | taxi
let flash = false;
let session = null;
let authChecked = false;
let authError = "";

// Staff role lives in the JWT (app_metadata.role, set via SQL/Auth admin API —
// never editable by the user themselves), mirrored server-side in RLS
// policies. Unset defaults to "reception" (full access), same as the DB side.
const ROLE_LABEL = { reception: "Rezeption", kitchen: "Küche", housekeeping: "Housekeeping", spa: "Spa" };
const ROLE_ORDER_TYPES = { kitchen: ["dining"], housekeeping: ["housekeeping"], spa: ["spa"] };
function currentRole() {
  return session?.user?.app_metadata?.role || "reception";
}
function isReception() {
  return currentRole() === "reception";
}

// postcard-compose state
let pcRoom = "all";
let pcFont = FONT_OPTIONS[0].id;
let pcText = "";

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

const TABLE_FOR = { menu: "menu_items", spaServices: "spa_services", taxiOptions: "taxi_options", excursions: "excursions" };
const COL_FOR = { desc: "description" };

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
    const field = segs[1];
    if (field === "welcome" || field === "rules") {
      await updateHotelContent({ [field]: s.content[field] });
    } else {
      await updateHotelContent({ [camelToSnake(field)]: value });
    }
  } else if (root0 === "spaSlots") {
    await updateHotelContent({ spa_slots: s.spaSlots });
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

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function sidebar() {
  const reception = isReception();
  const items = [
    { id: "dashboard", icon: "clipboardList", label: "Bestellungen" },
    ...(reception ? [{ id: "postcard", icon: "mail", label: "Postkarte senden" }] : []),
  ];
  const contentItems = [
    { id: "info", icon: "conciergeBell", label: "Hotel-Infos" },
    { id: "dining", icon: "utensilsCrossed", label: "Speisekarte" },
    { id: "spa", icon: "flower2", label: "Spa-Angebote" },
    { id: "taxi", icon: "carTaxiFront", label: "Taxi & Ausflüge" },
  ];
  const accessItems = [{ id: "qr", icon: "doorOpen", label: "QR-Codes fürs Zimmer" }];
  return `
    <div class="admin-sidebar">
      <div class="admin-brand">
        <div class="brand-mark">${vaseLogo({ size: 34 })}</div>
        <div><div class="admin-brand-name"><span class="brand-kicker" style="color:var(--gold-500);">SWISS</span> <span class="brand-word">Baan Chiang</span></div><div class="admin-brand-sub">Backoffice</div></div>
      </div>
      <div class="admin-nav">
        <div class="section-label">Live</div>
        ${items.map((i) => navBtn(i)).join("")}
        ${
          reception
            ? `<div class="section-label">Inhalte pflegen</div>
               ${contentItems.map((i) => navBtn(i)).join("")}
               <div class="section-label">Gästezugang</div>
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

// ---------- DASHBOARD ----------
const STATUSES = [
  { id: "new", label: "Neu" },
  { id: "in_progress", label: "In Bearbeitung" },
  { id: "done", label: "Erledigt" },
];
const TYPE_LABEL = { dining: "Zimmerservice", housekeeping: "Housekeeping", spa: "Spa", taxi: "Taxi", excursion: "Ausflug" };
const TYPE_ICON = { dining: "utensilsCrossed", housekeeping: "brushCleaning", spa: "flower2", taxi: "carTaxiFront", excursion: "mapPin" };
const NEXT_STATUS = { new: "in_progress", in_progress: "done" };

const ROLE_DASHBOARD_TITLE = {
  reception: ["Bestellungen &amp; Wünsche", "Alle Anfragen aus den Zimmern in Echtzeit"],
  kitchen: ["Küchen-Bestellungen", "Zimmerservice-Anfragen aus den Zimmern in Echtzeit"],
  housekeeping: ["Housekeeping-Wünsche", "Housekeeping-Anfragen aus den Zimmern in Echtzeit"],
  spa: ["Spa-Termine", "Spa-Anfragen aus den Zimmern in Echtzeit"],
};

function viewDashboard() {
  const role = currentRole();
  const allowedTypes = ROLE_ORDER_TYPES[role];
  const orders = [...getState().orders]
    .filter((o) => !allowedTypes || allowedTypes.includes(o.type))
    .sort((a, b) => b.createdAt - a.createdAt);
  const [title, sub] = ROLE_DASHBOARD_TITLE[role] || ROLE_DASHBOARD_TITLE.reception;
  return `
    ${topHeader(title, sub)}
    <div class="kanban">
      ${STATUSES.map((st) => {
        const list = orders.filter((o) => o.status === st.id);
        return `
        <div class="kanban-col">
          <h3>${st.label} <span class="kanban-count">${list.length}</span></h3>
          ${list.length === 0 ? `<p class="muted" style="font-size:13px;">Keine Einträge</p>` : list.map((o) => orderChip(o)).join("")}
        </div>`;
      }).join("")}
    </div>`;
}

function orderChip(o) {
  const next = NEXT_STATUS[o.status];
  return `
    <div class="order-chip">
      <div class="row-between">
        <span class="room-tag">Zi. ${o.room}</span>
        <span class="type-tag">${TYPE_ICON[o.type] ? icon(TYPE_ICON[o.type], { size: 13 }) : ""} ${TYPE_LABEL[o.type] || o.type}</span>
      </div>
      <div class="items">${o.items.map(escapeHtml).join(", ")}</div>
      ${o.note ? `<div class="note">${icon("scrollText", { size: 13 })} ${escapeHtml(o.note)}</div>` : ""}
      <div class="meta">${fmtTime(o.createdAt)}${o.total ? ` · CHF ${o.total.toFixed(2)}` : ""}</div>
      <div class="actions">
        ${next ? `<button class="pill-btn sm" data-action="advance" data-id="${o.id}" data-next="${next}">${icon("arrowRight", { size: 13 })} ${STATUSES.find((s) => s.id === next).label}</button>` : ""}
        ${o.status !== "new" ? `<button class="pill-btn sm outline" data-action="advance" data-id="${o.id}" data-next="new">↺</button>` : ""}
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
        placeholder: "So erscheint Ihre Postkarte auf dem Gästegerät …",
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
    msg.textContent = "So erscheint Ihre Postkarte auf dem Gästegerät …";
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
function triLang(baseLabel, basePath, multiline = false) {
  const s = getState();
  const langs = [["de", "DE"], ["en", "EN"], ["th", "TH"]];
  return `
    <div class="plain-field">
      <label>${baseLabel}</label>
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
          <div class="editor-grid cols-3" style="margin-bottom:8px;">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Titel ${code.toUpperCase()}</span><input value="${escapeAttr(tip.title[code] || "")}" data-bind="content.localTips.${i}.title.${code}" /></div>`).join("")}
          </div>
          <div class="editor-grid cols-3">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Text ${code.toUpperCase()}</span><input value="${escapeAttr(tip.desc[code] || "")}" data-bind="content.localTips.${i}.desc.${code}" /></div>`).join("")}
          </div>
        </div>`
        )
        .join("")}
      <button class="add-btn" data-action="add-tip">+ Tipp hinzufügen</button>
    </div>
  `;
}

// ---------- MENU EDITOR ----------
function viewDining() {
  const s = getState();
  return `
    ${topHeader("Speisekarte", "Artikel, Preise und Übersetzungen für den Zimmerservice")}
    <div class="editor-section">
      ${s.menu
        .map(
          (m, i) => `
        <div class="item-editor-row">
          <div class="row-top">
            <select data-bind="menu.${i}.category">
              ${s.menuCategories.map((c) => `<option value="${c.id}" ${c.id === m.category ? "selected" : ""}>${tf(c.label, "de")}</option>`).join("")}
            </select>
            <button class="remove-btn" data-action="remove-item" data-collection="menu" data-index="${i}">${icon("x", { size: 13 })}</button>
          </div>
          <div class="editor-grid cols-3">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Name ${code.toUpperCase()}</span><input value="${escapeAttr(m.name[code] || "")}" data-bind="menu.${i}.name.${code}" /></div>`).join("")}
          </div>
          <div class="editor-grid cols-3" style="margin-top:8px;">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Beschreibung ${code.toUpperCase()}</span><input value="${escapeAttr(m.desc[code] || "")}" data-bind="menu.${i}.desc.${code}" /></div>`).join("")}
          </div>
          <div class="num-row">
            <div class="field-mini"><label>Preis (CHF)</label><input type="number" step="0.5" value="${m.price}" data-bind="menu.${i}.price" data-number="true" /></div>
          </div>
        </div>`
        )
        .join("")}
      <button class="add-btn" data-action="add-item" data-collection="menu">+ Neuer Artikel</button>
    </div>`;
}

// ---------- SPA EDITOR ----------
function viewSpa() {
  const s = getState();
  return `
    ${topHeader("Spa-Angebote", "Behandlungen, Dauer und Preise")}
    <div class="editor-section">
      ${s.spaServices
        .map(
          (sv, i) => `
        <div class="item-editor-row">
          <div class="row-top">
            <span class="muted">Behandlung ${i + 1}</span>
            <button class="remove-btn" data-action="remove-item" data-collection="spaServices" data-index="${i}">${icon("x", { size: 13 })}</button>
          </div>
          <div class="editor-grid cols-3">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Name ${code.toUpperCase()}</span><input value="${escapeAttr(sv.name[code] || "")}" data-bind="spaServices.${i}.name.${code}" /></div>`).join("")}
          </div>
          <div class="num-row">
            <div class="field-mini"><label>Dauer (Min.)</label><input type="number" value="${sv.duration}" data-bind="spaServices.${i}.duration" data-number="true" /></div>
            <div class="field-mini"><label>Preis (CHF)</label><input type="number" step="0.5" value="${sv.price}" data-bind="spaServices.${i}.price" data-number="true" /></div>
          </div>
        </div>`
        )
        .join("")}
      <button class="add-btn" data-action="add-item" data-collection="spaServices">+ Behandlung hinzufügen</button>
    </div>
    <div class="editor-section">
      <h3>Verfügbare Uhrzeiten <span class="rules-hint">(kommagetrennt)</span></h3>
      <input class="plain-field" style="border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:14px;width:100%;" value="${s.spaSlots.join(", ")}" data-bind="spaSlots" data-list="comma" />
    </div>`;
}

// ---------- TAXI EDITOR ----------
function viewTaxi() {
  const s = getState();
  return `
    ${topHeader("Taxi &amp; Ausflüge", "Fahrtoptionen und buchbare Ausflüge")}
    <div class="editor-section">
      <h3>Fahrtoptionen</h3>
      ${s.taxiOptions
        .map(
          (o, i) => `
        <div class="item-editor-row">
          <div class="row-top"><span class="muted">Option ${i + 1}</span><button class="remove-btn" data-action="remove-item" data-collection="taxiOptions" data-index="${i}">${icon("x", { size: 13 })}</button></div>
          <div class="editor-grid cols-3">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Name ${code.toUpperCase()}</span><input value="${escapeAttr(o.name[code] || "")}" data-bind="taxiOptions.${i}.name.${code}" /></div>`).join("")}
          </div>
        </div>`
        )
        .join("")}
      <button class="add-btn" data-action="add-item" data-collection="taxiOptions">+ Fahrtoption hinzufügen</button>
    </div>
    <div class="editor-section">
      <h3>Ausflüge</h3>
      ${s.excursions
        .map(
          (e, i) => `
        <div class="item-editor-row">
          <div class="row-top"><span class="muted">Ausflug ${i + 1}</span><button class="remove-btn" data-action="remove-item" data-collection="excursions" data-index="${i}">${icon("x", { size: 13 })}</button></div>
          <div class="editor-grid cols-3">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Name ${code.toUpperCase()}</span><input value="${escapeAttr(e.name[code] || "")}" data-bind="excursions.${i}.name.${code}" /></div>`).join("")}
          </div>
          <div class="editor-grid cols-3" style="margin-top:8px;">
            ${["de", "en", "th"].map((code) => `<div class="ml-field"><span class="lang-tag">Beschreibung ${code.toUpperCase()}</span><input value="${escapeAttr(e.desc[code] || "")}" data-bind="excursions.${i}.desc.${code}" /></div>`).join("")}
          </div>
          <div class="num-row"><div class="field-mini"><label>Preis (CHF)</label><input type="number" step="0.5" value="${e.price}" data-bind="excursions.${i}.price" data-number="true" /></div></div>
        </div>`
        )
        .join("")}
      <button class="add-btn" data-action="add-item" data-collection="excursions">+ Ausflug hinzufügen</button>
    </div>`;
}

// ---------- QR CODES ----------
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
          .map(
            (r) => `
          <div class="qr-card">
            <img src="qr/zimmer-${escapeHtml(r)}.png" alt="QR-Code Zimmer ${escapeHtml(r)}" />
            <div class="qr-room">Zimmer ${escapeHtml(r)}</div>
            <div class="qr-url">${escapeHtml(SITE_URL)}/index.html?room=${escapeHtml(r)}</div>
            <a class="pill-btn sm outline no-print" href="qr/zimmer-${escapeHtml(r)}.png" download="zimmer-${escapeHtml(r)}-qr.png">Herunterladen</a>
          </div>`
          )
          .join("")}
      </div>
      <p class="rules-hint" style="margin-top:18px;">
        Neues Zimmer hinzugekommen? <code>node generate-qrcodes.js</code> im Projektordner
        erneut ausführen (Liste dort mit der <code>rooms</code>-Tabelle abgleichen) und die
        neue PNG-Datei ins Projekt committen/pushen.
      </p>
    </div>`;
}

const SITE_URL = "https://sbc26.github.io/Concierge";
const PAGES = { dashboard: viewDashboard, postcard: viewPostcard, info: viewInfo, dining: viewDining, spa: viewSpa, taxi: viewTaxi, qr: viewQr };
const TABLE_FOR_COLLECTION = { menu: "menu_items", spaServices: "spa_services", taxiOptions: "taxi_options", excursions: "excursions" };
const MAPPER_FOR_COLLECTION = { menu: mapMenuItem, spaServices: mapSpaService, taxiOptions: mapTaxiOption, excursions: mapExcursion };
const BLANK_ITEM_PAYLOAD = {
  menu: (sortOrder) => ({ category: "mains", price: 0, name: { de: "Neuer Artikel", en: "New item", th: "รายการใหม่" }, description: { de: "", en: "", th: "" }, sort_order: sortOrder }),
  spaServices: (sortOrder) => ({ name: { de: "Neue Behandlung", en: "New treatment", th: "ทรีตเมนต์ใหม่" }, duration: 30, price: 0, sort_order: sortOrder }),
  taxiOptions: (sortOrder) => ({ name: { de: "Neue Option", en: "New option", th: "ตัวเลือกใหม่" }, sort_order: sortOrder }),
  excursions: (sortOrder) => ({ price: 0, name: { de: "Neuer Ausflug", en: "New excursion", th: "ทัวร์ใหม่" }, description: { de: "", en: "", th: "" }, sort_order: sortOrder }),
};
const BLANK_TIP = () => ({ icon: "mapPin", title: { de: "Neuer Tipp", en: "New tip", th: "เคล็ดลับใหม่" }, desc: { de: "", en: "", th: "" } });

// ---------- auth screens ----------
function loadingScreen() {
  return `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;color:var(--ink-soft);font-size:14px;">Lädt …</div>`;
}
function loginScreen() {
  return `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;width:100%;">
      <form data-action="login-form" style="background:var(--paper-2);border:1px solid var(--line);border-radius:var(--radius);padding:36px;width:340px;box-shadow:var(--shadow);">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:22px;">
          <div style="color:var(--gold-500);">${vaseLogo({ size: 40 })}</div>
          <div class="admin-brand-name" style="text-align:center;"><span class="brand-kicker">SWISS</span> <span class="brand-word">Baan Chiang</span></div>
          <div class="admin-brand-sub" style="color:var(--ink-soft);">Backoffice-Login</div>
        </div>
        <div class="plain-field"><label>E-Mail</label><input id="login-email" type="email" autocomplete="username" required /></div>
        <div class="plain-field"><label>Passwort</label><input id="login-password" type="password" autocomplete="current-password" required /></div>
        ${authError ? `<p style="color:#a34a3a;font-size:13px;margin:-6px 0 14px;">${escapeHtml(authError)}</p>` : ""}
        <button class="pill-btn full gold" type="submit">Anmelden</button>
      </form>
    </div>`;
}

function render() {
  if (!authChecked) return (root.innerHTML = loadingScreen());
  if (!session) return (root.innerHTML = loginScreen());
  if (!isReady()) return (root.innerHTML = loadingScreen());
  if (!isReception() && page !== "dashboard") page = "dashboard";
  root.innerHTML = sidebar() + `<div class="admin-main">${PAGES[page]()}</div>`;
  if (page === "postcard") hydratePostcardPage();
}

root.addEventListener("submit", async (e) => {
  const form = e.target.closest('[data-action="login-form"]');
  if (!form) return;
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  authError = "";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    authError = "E-Mail oder Passwort ist falsch.";
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
  if (action === "print") {
    window.print();
    return;
  }
  if (action === "nav") {
    page = t.dataset.page;
    return render();
  }
  if (action === "advance") {
    setOrderStatus(t.dataset.id, t.dataset.next);
    return;
  }
  if (action === "add-item") {
    const coll = t.dataset.collection;
    const s = getState();
    const row = await insertRow(TABLE_FOR_COLLECTION[coll], BLANK_ITEM_PAYLOAD[coll](s[coll].length));
    if (row) s[coll].push(MAPPER_FOR_COLLECTION[coll](row));
    return render();
  }
  if (action === "remove-item") {
    const coll = t.dataset.collection;
    const idx = Number(t.dataset.index);
    const s = getState();
    const row = s[coll][idx];
    s[coll].splice(idx, 1);
    render();
    await deleteRow(TABLE_FOR_COLLECTION[coll], row.id);
    return;
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
