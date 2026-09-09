// Confirmation — shown once right after a request is submitted.
import { t, tv, tf } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { getState } from "../store.js";

let lastRequest = null;
let lastLines = [];

export function setConfirmation(request, lines) {
  lastRequest = request;
  lastLines = lines;
}
export function hasConfirmation() {
  return !!lastRequest;
}

export function confirmationView({ lang }) {
  if (!lastRequest) return "";
  const conciergeName = getState().content.conciergeName;
  return `
    <main>
      <div class="confirm-wrap">
        <div class="check-mark">${icon("check", { size: 26 })}</div>
        <span class="rule"></span>
        <h1 lang="${lang}">${t("confirmedTitle", lang)}</h1>
        <span class="rule"></span>
        <p class="body" lang="${lang}">${escapeHtml(
          lastLines.length === 1
            ? tv("confirmedBodySingular", lang, { name: conciergeName })
            : tv("confirmedBody", lang, { name: conciergeName, count: lastLines.length })
        )}</p>
        <div class="confirm-summary">
          <span class="section-label">${t("requestLabelPrefix", lang)} ${lastRequest.requestCode}</span>
          <div class="body-line">${lastLines.map((l) => escapeHtml(tf(l.serviceName, lang))).join(" · ")}</div>
        </div>
        <div class="confirm-actions">
          <button class="btn-primary" data-action="nav" data-route="myRequests">${t("statusAnsehenBtn", lang)}</button>
          <button class="btn-secondary" data-action="go-home">${t("backToOverviewBtn", lang)}</button>
        </div>
      </div>
    </main>`;
}
