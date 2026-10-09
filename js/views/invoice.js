// Rechnung — read-only statement for the villa's stay: lines the admin typed
// in, plus every concierge service the guest requested (listed automatically).
// Each line is marked paid/open; the open balance closes the page.
import { getState, invoiceLinesForRoom, invoiceExtrasForRoom, invoiceTotals } from "../store.js";
import { t, tf } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader } from "./shared.js";

export function fmtAmount(n, lang) {
  const locale = lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB";
  return `THB ${Math.round(n).toLocaleString(locale)}`;
}

export function invoiceView({ lang, room }) {
  const booking = getState().bookings.find((b) => b.room === room);
  const lines = invoiceLinesForRoom(room);
  const extras = invoiceExtrasForRoom(room);
  const totals = invoiceTotals(room);
  const empty = lines.length === 0 && extras.length === 0;

  const rows = [
    ...lines.map((l) => lineRow({ lang, title: l.description, amount: l.amount, paid: l.paid })),
    ...extras.map((i) => lineRow({
      lang, title: tf(i.serviceName, lang), sub: i.summary, amount: i.price, paid: i.invoicePaid,
      review: i.status === "in_pruefung",
    })),
  ].join("");

  return `
    ${renderBackHeader({ lang, label: t("invoiceTitle", lang) })}
    <main>
      <div class="title-block" style="padding-top:24px;">
        <span class="section-label">${t("invoiceForLabel", lang)}</span>
        <h1 lang="${lang}" style="font-size:32px;">${escapeHtml(booking?.guestName || room)}</h1>
        <p class="desc">${escapeHtml(room)}${booking?.bookingCode ? ` · ${escapeHtml(booking.bookingCode)}` : ""}</p>
      </div>
      ${
        empty
          ? `<div class="empty-state"><p lang="${lang}">${t("invoiceEmpty", lang)}</p></div>`
          : `<div class="invoice">
              <div class="invoice-head"><span lang="${lang}">${t("invoiceColDesc", lang)}</span><span lang="${lang}">${t("invoiceColAmount", lang)}</span></div>
              ${rows}
              <div class="invoice-sums">
                <div class="invoice-sum"><span lang="${lang}">${t("invoiceTotalLabel", lang)}</span><span>${fmtAmount(totals.total, lang)}</span></div>
                <div class="invoice-sum"><span lang="${lang}">${t("invoicePaidSumLabel", lang)}</span><span>${fmtAmount(totals.paid, lang)}</span></div>
                <div class="invoice-sum open ${totals.open <= 0 ? "settled" : ""}"><span lang="${lang}">${t("invoiceOpenSumLabel", lang)}</span><span>${fmtAmount(totals.open, lang)}</span></div>
              </div>
              ${totals.pending > 0 ? `<p class="invoice-note" lang="${lang}">${t("invoicePendingNote", lang)}</p>` : ""}
            </div>`
      }
    </main>`;
}

function lineRow({ lang, title, sub, amount, paid, review }) {
  const tag =
    amount == null
      ? `<span class="invoice-tag pending" lang="${lang}">${t("invoicePendingTag", lang)}</span>`
      : paid
        ? `<span class="invoice-tag paid" lang="${lang}">${t("invoicePaidTag", lang)}</span>`
        : `<span class="invoice-tag open" lang="${lang}">${t("invoiceOpenTag", lang)}</span>`;
  return `
    <div class="invoice-line ${paid && amount != null ? "is-paid" : ""}">
      <div class="invoice-desc">
        <div class="invoice-title" lang="${lang}">${escapeHtml(title || "—")}${review ? ` <span class="invoice-review" lang="${lang}">· ${t("invoiceInReviewTag", lang)}</span>` : ""}</div>
        ${sub ? `<div class="invoice-sub">${escapeHtml(sub)}</div>` : ""}
      </div>
      <div class="invoice-amount">
        <span class="invoice-amount-num">${amount == null ? "—" : fmtAmount(amount, lang)}</span>
        ${tag}
      </div>
    </div>`;
}
