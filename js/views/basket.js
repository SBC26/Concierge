// Anfragekorb — the request basket. Collects configured services, shows a
// running "Richtwert" total, and submits everything as one request.
import { getBasket, removeFromBasket, basketTotal, submitRequest } from "../store.js";
import { t, tf } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader, chf } from "./shared.js";

export function basketView({ lang, room }) {
  const items = getBasket();
  const total = basketTotal();
  return `
    ${renderBackHeader({ lang, label: `${t("basketSectionLabel", lang)} · ${items.length}` })}
    <main>
      <div class="basket-grid">
        <div>
          <div class="title-block" style="padding-top:24px;">
            <h1 lang="${lang}" style="font-size:28px;">${t("basketTitle", lang)}</h1>
          </div>
          <div class="basket-list">
            ${items.length === 0 ? `<div class="empty-state"><div class="big">${icon("clipboardList", { size: 36 })}</div><p lang="${lang}">${t("basketEmpty", lang)}</p></div>` : items.map((it) => basketItemCard(it, lang)).join("")}
          </div>
          <button class="add-service-row" data-action="go-home">${icon("plus", { size: 16 })} ${t("addMoreRow", lang)}</button>
        </div>
        <div class="basket-right">
          ${items.length > 0 ? `
            <div class="total-card">
              <div class="row-between"><span>${t("richtwertLabel", lang)}</span><b>${chf(total)}</b></div>
              <div class="fine-print" lang="${lang}">${t("richtwertFinePrint", lang)}</div>
            </div>
            <div class="section-pad">
              <div class="form-group">
                <label class="section-label">${t("messageLabel", lang)}</label>
                <textarea class="field-input" id="basket-message" placeholder="${escapeHtml(t("messagePlaceholder", lang))}"></textarea>
              </div>
            </div>
            <div class="section-pad">
              <button class="btn-primary" data-action="submit-basket">${t("sendRequestBtn", lang)}</button>
            </div>` : ""}
        </div>
      </div>
    </main>`;
}

function basketItemCard(it, lang) {
  return `
    <div class="basket-item">
      <div class="row-between">
        <span class="title" lang="${lang}">${escapeHtml(tf(it.serviceName, lang))}</span>
        ${it.price != null ? `<span class="price">${chf(it.price)}</span>` : `<span class="price">${t("inclusiveLabel", lang)}</span>`}
      </div>
      ${it.summary ? `<div class="summary">${escapeHtml(it.summary)}</div>` : ""}
      <div class="actions">
        <button data-action="basket-edit" data-key="${it.key}">${t("changeLink", lang)}</button>
        <button data-action="basket-remove" data-key="${it.key}">${t("removeLink", lang)}</button>
      </div>
    </div>`;
}

export async function doSubmitBasket({ room }) {
  const items = getBasket();
  if (items.length === 0) return null;
  const message = document.getElementById("basket-message")?.value || "";
  const lines = items.map((it) => ({ serviceId: it.serviceId, category: it.category, serviceName: it.serviceName, summary: it.summary, price: it.price }));
  const request = await submitRequest({ room, message, lines });
  return request ? { request, lines } : null;
}

export { removeFromBasket };
