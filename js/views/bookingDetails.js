// Buchungsdetails — read-only stay facts plus the villa address.
import { getState } from "../store.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader } from "./shared.js";

export function bookingDetailsView({ lang, room }) {
  const booking = getState().bookings.find((b) => b.room === room);
  if (!booking) return `${renderBackHeader({ lang, labelKey: "bookingDetailsSectionLabel" })}<main></main>`;
  const locale = lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB";
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "long" }) : "");
  const rows = [
    [t("arrivalLabel", lang), fmt(booking.arrival)],
    [t("departureLabel", lang), fmt(booking.departure)],
    [t("guestsLabel", lang), `${booking.guestsAdults} ${t("adultsUnit", lang)}${booking.guestsChildren ? `, ${booking.guestsChildren} ${t("childrenUnit", lang)}` : ""}`],
    [t("cleaningLabel", lang), booking.cleaningSchedule],
    [t("depositLabel", lang), booking.depositStatus],
  ];

  return `
    ${renderBackHeader({ lang, label: `${t("bookingDetailsSectionLabel", lang)} ${booking.bookingCode}` })}
    <main>
      <div class="title-block" style="padding-top:24px;">
        <span class="section-label">${t("villaLabel", lang)}</span>
        <h1 lang="${lang}" style="font-size:32px;">${escapeHtml(booking.room)}</h1>
        <p class="desc">${booking.bedrooms ? `${booking.bedrooms} SZ · ` : ""}${booking.sizeSqm ? `${booking.sizeSqm} m² · ` : ""}${escapeHtml(booking.feature)}</p>
      </div>
      <div class="def-list" style="margin-top:16px;">
        ${rows.filter(([, v]) => v).map(([label, value]) => `<div class="def-row"><span class="label">${label}</span><span class="value">${escapeHtml(String(value))}</span></div>`).join("")}
      </div>
      <div class="address-card">
        <span class="section-label">${t("addressLabel", lang)}</span>
        <div>${escapeHtml(booking.address)}</div>
        <div class="links">
          <button data-action="open-maps" data-address="${escapeHtml(booking.address)}">${t("openMapsLink", lang)}</button>
          <button data-action="copy-text" data-text="${escapeHtml(booking.address)}">${t("copyAddressLink", lang)}</button>
        </div>
      </div>
      <div class="secondary-nav" style="margin-top:8px;">
        <button class="nav-row" data-action="open-maps" data-address="${escapeHtml(booking.address)}">
          <span lang="${lang}">${t("arrivalNavLabel", lang)}</span>${icon("arrowRight", { size: 18 })}
        </button>
        <button class="nav-row" data-action="coming-soon">
          <span lang="${lang}">${t("invoiceNavLabel", lang)}</span>${icon("arrowRight", { size: 18 })}
        </button>
      </div>
    </main>`;
}
