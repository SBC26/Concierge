import { t, tf, LANGS, LANG_LABELS } from "./i18n.js";
import { getState, subscribe, isReady, initStore, getRoom, getLang, setLang, addOrder, ordersForRoom, postcardsForRoom, getDismissedPostcards, dismissPostcard } from "./store.js";
import { escapeHtml, FONT_MAP } from "./util.js";
import { icon } from "./icons.js";
import { vaseLogo } from "./logo.js";
import { setupActive, renderRoomSetup, initRoomSetup } from "./roomSetup.js";

const app = document.getElementById("app");

let route = "home";
let lang = getLang();
let room = getRoom();

// transient (per-visit) UI state
let cart = {}; // itemId -> qty
let taxiTab = "ride";
let selectedSpaService = null;
let selectedSpaSlot = null;
let selectedHousekeeping = new Set();
let sheetHTML = null;
let sheetAfterMount = null;

function navigate(r) {
  route = r;
  sheetHTML = null;
  render();
  window.scrollTo(0, 0);
}

function money(n) {
  return `${t("chf", lang)} ${n.toFixed(2)}`;
}

function statusLabel(s) {
  return s === "new" ? t("statusNew", lang) : s === "in_progress" ? t("statusProgress", lang) : t("statusDone", lang);
}

function timeAgo(ts) {
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min < 1) return lang === "de" ? "gerade eben" : lang === "th" ? "เมื่อสักครู่" : "just now";
  if (min < 60) return `${min} ${lang === "de" ? "Min." : lang === "th" ? "นาทีที่แล้ว" : "min ago"}`;
  const h = Math.round(min / 60);
  return `${h} ${lang === "de" ? "Std." : lang === "th" ? "ชม.ที่แล้ว" : "h ago"}`;
}

function langSwitcher() {
  return `<div class="lang-switch">${LANGS.map(
    (l) => `<button class="lang-btn ${l === lang ? "active" : ""}" data-action="set-lang" data-lang="${l}">${l.toUpperCase()}</button>`
  ).join("")}</div>`;
}

function header({ title, sub, showBack = false }) {
  const [kicker, ...rest] = t("hotelName", lang).split(" ");
  return `
  <div class="topbar">
    <div class="topbar-row">
      ${
        showBack
          ? `<button class="back-btn" data-action="go-home">${icon("arrowLeft", { size: 18 })}</button>`
          : `<div class="brand"><div class="brand-mark">${vaseLogo({ size: 34 })}</div>
              <div><div class="brand-name"><span class="brand-kicker">${kicker}</span> <span class="brand-word" lang="${lang}">${rest.join(" ")}</span></div><div class="brand-tagline">${t("tagline", lang)}</div></div>
            </div>`
      }
      <div class="chip-row">
        <div class="chip" style="cursor:default;">${icon("doorOpen", { size: 15 })} ${t("room", lang)} ${room}</div>
        ${langSwitcher()}
      </div>
    </div>
    ${title ? `<div class="page-title"><h1 lang="${lang}">${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>` : ""}
  </div>`;
}

// ---------- HOME ----------
function viewHome() {
  const cards = [
    { route: "info", icon: "conciergeBell", label: t("navInfo", lang) },
    { route: "dining", icon: "utensilsCrossed", label: t("navDining", lang) },
    { route: "housekeeping", icon: "brushCleaning", label: t("navHousekeeping", lang) },
    { route: "spa", icon: "flower2", label: t("navSpa", lang) },
    { route: "taxi", icon: "carTaxiFront", label: t("navTaxi", lang) },
    { route: "orders", icon: "clipboardList", label: t("navOrders", lang) },
  ];
  return `
    ${header({})}
    <main>
      <div class="greeting">
        <h2 lang="${lang}">${t("homeGreetingTitle", lang)}</h2>
        <p lang="${lang}">${t("homeGreetingSub", lang)}</p>
      </div>
      <div class="menu-grid">
        ${cards
          .map(
            (c) => `
          <button class="menu-card" data-action="${c.action || "nav"}" ${c.route ? `data-route="${c.route}"` : ""}>
            <div class="icon">${icon(c.icon, { size: 22 })}</div>
            <div class="label" lang="${lang}">${c.label}</div>
          </button>`
          )
          .join("")}
      </div>
    </main>`;
}

// ---------- INFO ----------
let openAccordion = "wifi";
function viewInfo() {
  const c = getState().content;
  const kv = (label, value, iconName) => `<div class="kv"><span>${icon(iconName, { size: 15 })} ${label}</span><b>${value}</b></div>`;
  const items = [
    {
      id: "wifi",
      icon: "wifi",
      title: t("infoWifi", lang),
      body: `<div class="kv"><span>${t("infoWifiNetwork", lang)}</span><b>${c.wifiSsid}</b></div>
             <div class="kv"><span>${t("infoWifiPassword", lang)}</span><b>${c.wifiPassword}</b></div>`,
    },
    {
      id: "hours",
      icon: "clock",
      title: t("infoHours", lang),
      body: `${kv(t("infoBreakfast", lang), c.breakfastHours, "sunrise")}
             ${kv(t("infoRestaurant", lang), c.restaurantHours, "utensils")}
             ${kv(t("infoSpaHours", lang), c.spaHours, "flower2")}
             ${kv(t("infoCheckin", lang), c.checkin, "logIn")}
             ${kv(t("infoCheckout", lang), c.checkout, "logOut")}`,
    },
    {
      id: "rules",
      icon: "scrollText",
      title: t("infoRules", lang),
      body: `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px;">${(c.rules[lang] || c.rules.de)
        .map((r) => `<li style="font-size:14px;color:var(--ink-soft);">${r}</li>`)
        .join("")}</ul>`,
    },
    {
      id: "reception",
      icon: "phoneCall",
      title: t("infoReception", lang),
      body: `<p class="muted" style="margin-bottom:12px;">${c.receptionPhone}</p>
             <a class="pill-btn full" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;" href="tel:${c.receptionPhone.replace(/\s/g, "")}">${icon("phoneCall", { size: 16 })} ${t("infoCallReception", lang)}</a>`,
    },
  ];

  return `
    ${header({ title: t("navInfo", lang), showBack: true })}
    <main>
      <div class="card" style="background:var(--gold-100);border-color:var(--gold-500);">
        <p lang="${lang}" style="font-size:14px;line-height:1.5;">${tf(c.welcome, lang)}</p>
      </div>
      ${items
        .map(
          (it) => `
        <div class="accordion-item ${openAccordion === it.id ? "open" : ""}">
          <div class="accordion-head" data-action="toggle-accordion" data-id="${it.id}">
            <span style="display:flex;align-items:center;gap:10px;"><span class="accordion-icon">${icon(it.icon, { size: 17 })}</span>${it.title}</span><span class="arrow">${icon("chevronDown", { size: 16 })}</span>
          </div>
          <div class="accordion-body">${it.body}</div>
        </div>`
        )
        .join("")}

      <h3 style="margin:20px 0 12px;color:var(--teal-950);font-size:17px;">${t("infoLocalTips", lang)}</h3>
      <div class="card">
        ${c.localTips
          .map(
            (tip) => `
          <div class="tip-card">
            <div class="icon">${icon(tip.icon, { size: 22 })}</div>
            <div><div class="title">${tf(tip.title, lang)}</div><div class="desc">${tf(tip.desc, lang)}</div></div>
          </div>`
          )
          .join("")}
      </div>
    </main>`;
}

// ---------- DINING ----------
let diningCategory = null;
function viewDining() {
  const s = getState();
  if (!diningCategory) diningCategory = s.menuCategories[0].id;
  const items = s.menu.filter((m) => m.category === diningCategory);
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

  return `
    ${header({ title: t("diningTitle", lang), sub: t("diningSub", lang), showBack: true })}
    <main>
      <div class="tabs">
        ${s.menuCategories
          .map(
            (c) => `<button class="tab-btn ${c.id === diningCategory ? "active" : ""}" data-action="set-dining-cat" data-cat="${c.id}">${tf(c.label, lang)}</button>`
          )
          .join("")}
      </div>
      <div class="card">
        ${items
          .map((m) => {
            const qty = cart[m.id] || 0;
            return `
          <div class="item-row">
            <div>
              <div class="item-name">${tf(m.name, lang)}</div>
              ${tf(m.desc, lang) ? `<div class="item-desc">${tf(m.desc, lang)}</div>` : ""}
              <div class="item-price">${money(m.price)}</div>
            </div>
            ${
              qty === 0
                ? `<button class="pill-btn sm gold" data-action="cart-add" data-id="${m.id}">${t("addToCart", lang)}</button>`
                : `<div class="stepper">
                    <button data-action="cart-dec" data-id="${m.id}">${icon("minus", { size: 14 })}</button>
                    <span class="count">${qty}</span>
                    <button data-action="cart-inc" data-id="${m.id}">${icon("plus", { size: 14 })}</button>
                  </div>`
            }
          </div>`;
          })
          .join("")}
      </div>
    </main>
    ${cartCount > 0 ? cartBar(cartCount) : ""}`;
}

function cartBar(count) {
  const s = getState();
  const total = Object.entries(cart).reduce((sum, [id, qty]) => sum + (s.menu.find((m) => m.id === id)?.price || 0) * qty, 0);
  return `
    <div class="cart-bar"><div class="cart-bar-inner" data-action="open-cart">
      <div class="left"><span class="cart-badge">${count}</span> ${t("cart", lang)}</div>
      <div class="row-between" style="gap:6px;">${money(total)} ${icon("arrowRight", { size: 16 })}</div>
    </div></div>`;
}

function cartSheet() {
  const s = getState();
  const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const total = entries.reduce((sum, [id, qty]) => sum + (s.menu.find((m) => m.id === id)?.price || 0) * qty, 0);
  return `
    <div class="sheet-head"><h3>${t("cart", lang)}</h3><button class="icon-btn" data-action="close-sheet">${icon("x", { size: 15 })}</button></div>
    ${
      entries.length === 0
        ? `<p class="muted">${t("cartEmpty", lang)}</p>`
        : entries
            .map(([id, qty]) => {
              const m = s.menu.find((x) => x.id === id);
              return `<div class="item-row">
                <div><div class="item-name">${tf(m.name, lang)}</div><div class="item-desc">${money(m.price)} × ${qty}</div></div>
                <div class="stepper">
                  <button data-action="cart-dec" data-id="${id}">${icon("minus", { size: 14 })}</button>
                  <span class="count">${qty}</span>
                  <button data-action="cart-inc" data-id="${id}">${icon("plus", { size: 14 })}</button>
                </div>
              </div>`;
            })
            .join("")
    }
    ${
      entries.length > 0
        ? `<div class="field" style="margin-top:14px;">
            <label>${t("specialRequests", lang)}</label>
            <textarea id="dining-note" placeholder="…"></textarea>
          </div>
          <div class="row-between" style="margin:14px 0;"><span class="muted">${t("total", lang)}</span><b style="color:var(--teal-950);font-size:17px;">${money(total)}</b></div>
          <button class="pill-btn full" data-action="submit-dining">${t("submitOrder", lang)}</button>`
        : ""
    }`;
}

// ---------- HOUSEKEEPING ----------
function viewHousekeeping() {
  const s = getState();
  return `
    ${header({ title: t("housekeepingTitle", lang), sub: t("housekeepingSub", lang), showBack: true })}
    <main>
      ${s.housekeepingOptions
        .map(
          (o) => `
        <div class="option-toggle ${selectedHousekeeping.has(o.id) ? "selected" : ""}" data-action="toggle-hk" data-id="${o.id}">
          <div class="icon">${icon(o.icon, { size: 22 })}</div>
          <div class="name">${tf(o.name, lang)}</div>
          <div class="check-circle">${selectedHousekeeping.has(o.id) ? icon("check", { size: 12 }) : ""}</div>
        </div>`
        )
        .join("")}
      <div class="field" style="margin-top:14px;">
        <label>${t("preferredTime", lang)}</label>
        <input type="time" id="hk-time" />
      </div>
      <div class="field">
        <label>${t("specialRequests", lang)}</label>
        <textarea id="hk-note" placeholder="…"></textarea>
      </div>
      <button class="pill-btn full" data-action="submit-hk" ${selectedHousekeeping.size === 0 ? "disabled" : ""}>${t("sendRequest", lang)}</button>
    </main>`;
}

// ---------- SPA ----------
function viewSpa() {
  const s = getState();
  return `
    ${header({ title: t("spaTitle", lang), sub: t("spaSub", lang), showBack: true })}
    <main>
      ${s.spaServices
        .map(
          (sv) => `
        <div class="option-toggle ${selectedSpaService === sv.id ? "selected" : ""}" data-action="select-spa" data-id="${sv.id}">
          <div class="icon">${icon("flower2", { size: 22 })}</div>
          <div style="flex:1;">
            <div class="name">${tf(sv.name, lang)}</div>
            <div class="muted">${sv.duration} ${t("minutes", lang)} · ${money(sv.price)}</div>
          </div>
          <div class="check-circle">${selectedSpaService === sv.id ? icon("check", { size: 12 }) : ""}</div>
        </div>`
        )
        .join("")}

      ${
        selectedSpaService
          ? `<div class="card" style="margin-top:16px;">
              <h3>${t("chooseTime", lang)}</h3>
              <div class="slot-grid">
                ${s.spaSlots
                  .map((slot) => `<button class="slot-btn ${selectedSpaSlot === slot ? "selected" : ""}" data-action="select-slot" data-slot="${slot}">${slot}</button>`)
                  .join("")}
              </div>
            </div>`
          : ""
      }
      <button class="pill-btn full" data-action="submit-spa" ${!selectedSpaService || !selectedSpaSlot ? "disabled" : ""} style="margin-top:6px;">
        ${t("bookNow", lang)}
      </button>
    </main>`;
}

// ---------- TAXI ----------
function viewTaxi() {
  const s = getState();
  return `
    ${header({ title: t("taxiTitle", lang), showBack: true })}
    <main>
      <div class="tabs">
        <button class="tab-btn ${taxiTab === "ride" ? "active" : ""}" data-action="set-taxi-tab" data-tab="ride">${t("taxiTabRide", lang)}</button>
        <button class="tab-btn ${taxiTab === "trips" ? "active" : ""}" data-action="set-taxi-tab" data-tab="trips">${t("taxiTabTrips", lang)}</button>
      </div>
      ${taxiTab === "ride" ? taxiRideForm(s) : taxiTripsList(s)}
    </main>`;
}

function taxiRideForm(s) {
  return `
    <div class="field">
      <label>${t("navTaxi", lang)}</label>
      <select id="taxi-type">${s.taxiOptions.map((o) => `<option value="${o.id}">${tf(o.name, lang)}</option>`).join("")}</select>
    </div>
    <div class="field"><label>${t("destination", lang)}</label><input type="text" id="taxi-dest" placeholder="…" /></div>
    <div class="field-row">
      <div class="field"><label>${t("pickupTime", lang)}</label><input type="time" id="taxi-time" /></div>
      <div class="field"><label>${t("passengers", lang)}</label><input type="number" id="taxi-pax" min="1" value="1" /></div>
    </div>
    <button class="pill-btn full" data-action="submit-taxi">${t("requestTaxi", lang)}</button>`;
}

function taxiTripsList(s) {
  return `<div class="card">${s.excursions
    .map(
      (e) => `
    <div class="item-row">
      <div>
        <div class="item-name">${tf(e.name, lang)}</div>
        <div class="item-desc">${tf(e.desc, lang)}</div>
        <div class="item-price">${money(e.price)}</div>
      </div>
      <button class="pill-btn sm gold" data-action="book-trip" data-id="${e.id}">${t("bookTrip", lang)}</button>
    </div>`
    )
    .join("")}</div>`;
}

// ---------- ORDERS ----------
function viewOrders() {
  const orders = ordersForRoom(room);
  return `
    ${header({ title: t("ordersTitle", lang), showBack: true })}
    <main>
      ${
        orders.length === 0
          ? `<div class="empty-state"><div class="big">${icon("clipboardList", { size: 40 })}</div><p>${t("ordersEmpty", lang)}</p></div>`
          : orders
              .map(
                (o) => `
          <div class="order-card">
            <div class="row-between">
              <b style="color:var(--teal-950);">${orderTypeLabel(o.type)}</b>
              <span class="status-badge ${o.status}">${statusLabel(o.status)}</span>
            </div>
            <div class="order-line">${o.items.map(escapeHtml).join(", ")}</div>
            ${o.note ? `<div class="order-line note-line">${icon("scrollText", { size: 13 })} ${escapeHtml(o.note)}</div>` : ""}
            <div class="order-line">${timeAgo(o.createdAt)}${o.total ? ` · ${money(o.total)}` : ""}</div>
          </div>`
              )
              .join("")
      }
    </main>`;
}

function orderTypeLabel(type) {
  return (
    {
      dining: t("navDining", lang),
      housekeeping: t("navHousekeeping", lang),
      spa: t("navSpa", lang),
      taxi: t("navTaxi", lang),
      excursion: t("taxiTabTrips", lang),
    }[type] || type
  );
}

// ---------- INCOMING POSTCARD (sent by staff, shown automatically) ----------
function getPendingPostcard() {
  const dismissed = getDismissedPostcards();
  const candidates = postcardsForRoom(room)
    .filter((p) => !dismissed.has(p.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  return candidates[0] || null;
}

function viewIncomingPostcard(pending) {
  const dateStr = new Date(pending.createdAt).toLocaleDateString(lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const [kicker, ...rest] = t("hotelName", lang).split(" ");
  const fontFamily = FONT_MAP[pending.font] || FONT_MAP.elegant;
  return `
    ${header({})}
    <main class="postcard-takeover">
      <div class="postcard-panel">
        <div class="postcard-panel-border">
          <div class="postcard-fs-logo">
            <div class="postcard-fs-icon">${vaseLogo({ size: 44 })}</div>
            <div class="postcard-fs-word"><span class="brand-kicker">${escapeHtml(kicker)}</span> <span lang="${lang}">${escapeHtml(rest.join(" "))}</span></div>
            <div class="postcard-fs-tagline">${escapeHtml(t("tagline", lang))}</div>
          </div>
          <div class="postcard-fs-message" style="font-family:${fontFamily};" lang="${lang}">${escapeHtml(pending.text)}</div>
          <div class="postcard-fs-footer">${escapeHtml(t("postcardFrom", lang))} ${escapeHtml(t("hotelName", lang))} · ${escapeHtml(t("room", lang))} ${escapeHtml(room)} · ${dateStr}</div>
        </div>
      </div>
      <button class="pill-btn gold postcard-fs-dismiss" data-action="dismiss-postcard" data-id="${pending.id}">${t("postcardThanks", lang)}</button>
    </main>`;
}

// ---------- RENDER ----------
const views = { home: viewHome, info: viewInfo, dining: viewDining, housekeeping: viewHousekeeping, spa: viewSpa, taxi: viewTaxi, orders: viewOrders };

function loadingScreen() {
  return `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--ink-soft);font-size:14px;">Lädt …</div>`;
}

function render() {
  document.documentElement.lang = lang;
  if (!isReady()) {
    app.innerHTML = loadingScreen();
    return;
  }
  if (setupActive()) {
    app.innerHTML = renderRoomSetup();
    return;
  }
  const pending = getPendingPostcard();
  app.innerHTML = pending ? viewIncomingPostcard(pending) : views[route]();
  document.querySelectorAll(".overlay").forEach((el) => el.remove());
  if (!pending && sheetHTML) {
    const wrap = document.createElement("div");
    wrap.className = "overlay";
    wrap.dataset.action = "close-sheet-bg";
    wrap.innerHTML = `<div class="sheet">${sheetHTML()}</div>`;
    document.body.appendChild(wrap);
    sheetAfterMount?.();
  }
}

function closeSheet() {
  sheetHTML = null;
  sheetAfterMount = null;
  document.querySelectorAll(".overlay").forEach((el) => el.remove());
}

function openSheet(fn, afterMount) {
  sheetHTML = fn;
  sheetAfterMount = afterMount || null;
  render();
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- EVENTS ----------
document.addEventListener("click", async (e) => {
  const bg = e.target.closest('[data-action="close-sheet-bg"]');
  if (bg && e.target === bg) return closeSheet();

  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;

  switch (action) {
    case "nav":
      return navigate(t.dataset.route);
    case "go-home":
      return navigate("home");
    case "set-lang":
      lang = t.dataset.lang;
      setLang(lang);
      return render();
    case "close-sheet":
      return closeSheet();
    case "toggle-accordion":
      openAccordion = openAccordion === t.dataset.id ? null : t.dataset.id;
      return render();

    // dining
    case "set-dining-cat":
      diningCategory = t.dataset.cat;
      return render();
    case "cart-add":
    case "cart-inc":
      cart[t.dataset.id] = (cart[t.dataset.id] || 0) + 1;
      return render();
    case "cart-dec":
      cart[t.dataset.id] = Math.max(0, (cart[t.dataset.id] || 0) - 1);
      return render();
    case "open-cart":
      return openSheet(cartSheet);
    case "submit-dining": {
      const s = getState();
      const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
      const items = entries.map(([id, qty]) => `${qty}× ${tf(s.menu.find((m) => m.id === id)?.name, lang)}`);
      const total = entries.reduce((sum, [id, qty]) => sum + (s.menu.find((m) => m.id === id)?.price || 0) * qty, 0);
      const note = document.getElementById("dining-note")?.value || "";
      await addOrder({ room, type: "dining", items, note, total });
      cart = {};
      closeSheet();
      navigate("orders");
      toast(t2("toastSent"));
      return;
    }

    // housekeeping
    case "toggle-hk":
      selectedHousekeeping.has(t.dataset.id) ? selectedHousekeeping.delete(t.dataset.id) : selectedHousekeeping.add(t.dataset.id);
      return render();
    case "submit-hk": {
      const s = getState();
      const items = [...selectedHousekeeping].map((id) => tf(s.housekeepingOptions.find((o) => o.id === id)?.name, lang));
      const time = document.getElementById("hk-time")?.value;
      const note = [document.getElementById("hk-note")?.value, time ? `${t2("preferredTime")}: ${time}` : ""].filter(Boolean).join(" · ");
      await addOrder({ room, type: "housekeeping", items, note });
      selectedHousekeeping = new Set();
      navigate("orders");
      toast(t2("toastSent"));
      return;
    }

    // spa
    case "select-spa":
      selectedSpaService = t.dataset.id;
      selectedSpaSlot = null;
      return render();
    case "select-slot":
      selectedSpaSlot = t.dataset.slot;
      return render();
    case "submit-spa": {
      const s = getState();
      const sv = s.spaServices.find((x) => x.id === selectedSpaService);
      await addOrder({ room, type: "spa", items: [tf(sv.name, lang)], note: `${t2("chooseTime")}: ${selectedSpaSlot}`, total: sv.price });
      selectedSpaService = null;
      selectedSpaSlot = null;
      navigate("orders");
      toast(t2("toastSent"));
      return;
    }

    // taxi
    case "set-taxi-tab":
      taxiTab = t.dataset.tab;
      return render();
    case "submit-taxi": {
      const s = getState();
      const typeSel = document.getElementById("taxi-type").value;
      const typeName = tf(s.taxiOptions.find((o) => o.id === typeSel)?.name, lang);
      const dest = document.getElementById("taxi-dest").value;
      const time = document.getElementById("taxi-time").value;
      const pax = document.getElementById("taxi-pax").value;
      await addOrder({ room, type: "taxi", items: [typeName], note: [dest, time, pax ? `${pax}p` : ""].filter(Boolean).join(" · ") });
      navigate("orders");
      toast(t2("toastSent"));
      return;
    }
    case "book-trip": {
      const s = getState();
      const trip = s.excursions.find((x) => x.id === t.dataset.id);
      await addOrder({ room, type: "excursion", items: [tf(trip.name, lang)], total: trip.price });
      navigate("orders");
      toast(t2("toastSent"));
      return;
    }

    case "dismiss-postcard":
      dismissPostcard(t.dataset.id);
      return render();
  }
});

function t2(key) {
  return t(key, lang);
}

subscribe(() => render());
render();
initStore();
initRoomSetup(render);
