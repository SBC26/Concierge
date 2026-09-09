// Meine Anfragen — status tracking, one card per requested service line
// (not per submission): three states, confirmed lines can carry fulfilment
// details (e.g. a driver's name and number).
import { getState, requestsForRoom } from "../store.js";
import { t, tv, tf } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader } from "./shared.js";

export function myRequestsView({ lang, room }) {
  const items = requestsForRoom(room);
  const conciergeName = getState().content.conciergeName;
  return `
    ${renderBackHeader({ lang, labelKey: "secNavRequests" })}
    <main>
      <div class="title-block" style="padding-top:24px;">
        <h1 lang="${lang}" style="font-size:28px;">${t("myRequestsTitle", lang)}</h1>
      </div>
      <div class="section-pad" style="margin-top:20px;">
        ${
          items.length === 0
            ? `<div class="empty-state"><div class="big">${icon("clipboardList", { size: 36 })}</div><p lang="${lang}">${t("myRequestsEmpty", lang)}</p></div>`
            : items.map((it) => requestCard(it, lang)).join("")
        }
      </div>
      ${items.length > 0 ? `<div class="closing-note" lang="${lang}">${escapeHtml(tv("myRequestsClosing", lang, { name: conciergeName }))}</div>` : ""}
    </main>`;
}

function requestCard(it, lang) {
  return `
    <div class="request-card ${it.status === "erledigt" ? "done" : ""}">
      <div class="row-between">
        <span class="title" lang="${lang}">${escapeHtml(tf(it.serviceName, lang))}</span>
        <span class="status-plaque ${it.status}">${statusLabel(it.status, lang)}</span>
      </div>
      ${it.summary ? `<div class="summary">${escapeHtml(it.summary)}</div>` : ""}
      ${it.fulfillmentNote ? `<div class="extra">${escapeHtml(it.fulfillmentNote)}</div>` : ""}
    </div>`;
}

function statusLabel(status, lang) {
  return status === "bestaetigt" ? t("statusBestaetigt", lang) : status === "erledigt" ? t("statusErledigt", lang) : t("statusInPruefung", lang);
}
