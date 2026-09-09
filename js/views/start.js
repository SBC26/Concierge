// Start / Dashboard — the hub screen. Brand header, greeting, current booking,
// the 3x3 service grid (8 tiles + the full-width "inklusive" maintenance row),
// secondary nav and the direct-contact block.
import { getState } from "../store.js";
import { t, tf } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { renderBrandHeader, abPrice } from "./shared.js";

export function startView({ lang, room, basketCount }) {
  const s = getState();
  const booking = s.bookings.find((b) => b.room === room);
  const services = s.services;
  const grid = services.filter((sv) => sv.category !== "maintenance");
  const maintenance = services.find((sv) => sv.category === "maintenance");
  const openRequests = s.requestItems.filter((i) => {
    const req = s.requests.find((r) => r.id === i.requestId);
    return req && req.room === room && i.status !== "erledigt";
  }).length;

  return `
    ${renderBrandHeader(lang)}
    <main>
      <div class="hero-grid">
        <div class="greeting">
          <h2 lang="${lang}">${escapeHtml(guestGreeting(booking, lang))}</h2>
          <p lang="${lang}">${t("greetingBody", lang)}</p>
        </div>
        ${booking ? bookingCard(booking, lang) : ""}
      </div>

      <div class="services-header">
        <span class="section-label">${t("servicesLabel", lang)}</span>
        <span class="unit">${t("servicesUnit", lang)}</span>
      </div>
      <div class="service-grid">
        ${grid.map((sv) => serviceTile(sv, lang)).join("")}
        ${maintenance ? `
          <button class="service-tile wide" data-action="nav-service" data-id="${maintenance.id}">
            <span class="title" lang="${lang}">${escapeHtml(tf(maintenance.name, lang))}</span>
            <span class="price">${t("inclusiveLabel", lang)}</span>
          </button>` : ""}
      </div>

      <div class="secondary-nav footer-cards">
        <button class="nav-row" data-action="nav" data-route="houseRules">
          <span lang="${lang}">${t("secNavRules", lang)}</span>${icon("arrowRight", { size: 18 })}
        </button>
        <button class="nav-row" data-action="nav" data-route="surroundings">
          <span lang="${lang}">${t("secNavSurroundings", lang)}</span>${icon("arrowRight", { size: 18 })}
        </button>
        <button class="nav-row" data-action="nav" data-route="myRequests">
          <span lang="${lang}">${t("secNavRequests", lang)}</span>
          ${openRequests > 0 ? `<span class="badge-gold">${openRequests} ${t("openCountSuffix", lang)}</span>` : icon("arrowRight", { size: 18 })}
        </button>
      </div>

      <div class="section-pad">
        <div class="contact-card">
          <div class="title" lang="${lang}">${t("contactTitle", lang)}</div>
          <div class="body" lang="${lang}">${escapeHtml(s.content.conciergeName)}, ${t("contactRoleLabel", lang)} · WhatsApp · ${t("contactHours", lang)}</div>
          ${s.content.conciergePhone ? `<a class="link" style="margin-top:6px;display:inline-block;" href="https://wa.me/${s.content.conciergePhone.replace(/[^\d]/g, "")}" target="_blank" rel="noopener">WhatsApp →</a>` : ""}
        </div>
      </div>
      ${basketCount > 0 ? basketBar(lang, basketCount) : ""}
    </main>`;
}

function guestGreeting(booking, lang) {
  const name = booking?.guestName || "";
  const hello = { de: "Hallo", en: "Hi", th: "สวัสดี" }[lang] || "Hallo";
  return name ? `${hello} ${name}` : hello;
}

function bookingCard(booking, lang) {
  return `
    <div class="booking-card">
      <div class="row-between">
        <span class="section-label">${t("bookingLabel", lang)}</span>
        <button class="link" data-action="nav" data-route="bookingDetails">${t("detailsLink", lang)}</button>
      </div>
      <div class="villa-name" lang="${lang}">${escapeHtml(booking.room)}</div>
      <div class="meta">${fmtRange(booking, lang)} · ${booking.guestsAdults + booking.guestsChildren} ${t("guestsLabel", lang)}${booking.bedrooms ? ` · ${booking.bedrooms} SZ` : ""}</div>
      <hr />
      <div class="weather">${escapeHtml(booking.weatherNote)}</div>
    </div>`;
}

function fmtRange(booking, lang) {
  if (!booking.arrival || !booking.departure) return "";
  const locale = lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB";
  const a = new Date(booking.arrival).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  const b = new Date(booking.departure).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  return `${a}–${b}`;
}

function serviceTile(sv, lang) {
  return `
    <button class="service-tile" data-action="nav-service" data-id="${sv.id}">
      <span class="title" lang="${lang}">${escapeHtml(tf(sv.name, lang))}</span>
      <span class="price">${abPrice(sv, lang)}</span>
    </button>`;
}

function basketBar(lang, count) {
  return `
    <div class="basket-bar"><div class="basket-bar-inner" data-action="nav" data-route="basket">
      <div class="left"><span class="basket-badge">${count}</span> ${t("basketSectionLabel", lang)}</div>
      ${icon("arrowRight", { size: 16 })}
    </div></div>`;
}
