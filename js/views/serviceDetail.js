// Service detail — one generic, data-driven template for all nine service
// categories, built from the service's own `optionGroups`. Reactive
// selections (segmented/choice-list/stepper) live in module state and
// re-render immediately; free-text/date/time fields are read from the DOM
// only when the guest adds the service to the basket, so typing never fights
// a full innerHTML re-render (same convention the old dining-note field used).
import { getState, getService, addToBasket as storeAddToBasket, updateBasketItem, getBasket } from "../store.js";
import { t, tf } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader, abPrice, renderOptionGroup, collectDraftValues, summarizeDraft, draftPrice } from "./shared.js";

let activeServiceId = null;
let draft = {};
let editingBasketKey = null;
let returnRoute = "home";

export function openService(id, fromRoute = "home") {
  activeServiceId = id;
  draft = {};
  editingBasketKey = null;
  returnRoute = fromRoute;
}

export function openServiceForEdit(basketKey) {
  const item = getBasket().find((b) => b.key === basketKey);
  if (!item) return;
  activeServiceId = item.serviceId;
  editingBasketKey = basketKey;
  returnRoute = "basket";
  const service = getService(item.serviceId);
  draft = {};
  for (const g of service?.optionGroups || []) {
    if (g.type === "segmented" || g.type === "stepper" || (g.type === "choice-list" && !g.multi)) draft[g.key] = item.optionValues?.[g.key];
    else if (g.type === "choice-list" && g.multi) draft[g.key] = item.optionValues?.[g.key] || [];
  }
}

export function activeService() {
  return activeServiceId ? getService(activeServiceId) : null;
}

export function optStep(key, dir) {
  const service = activeService();
  const group = service?.optionGroups.find((g) => g.key === key);
  if (!group) return;
  const cur = draft[key] ?? group.default ?? group.min ?? 1;
  const next = Math.max(group.min ?? 1, Math.min(group.max ?? 99, cur + Number(dir)));
  draft[key] = next;
}

export function optSet(key, value) {
  draft[key] = value;
}

export function optToggle(key, value) {
  const cur = draft[key] || [];
  draft[key] = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
}

// Called after the view is in the DOM, to prefill DOM-backed fields (date/time/text)
// when reopening a basket line for editing.
export function serviceDetailAfterMount() {
  if (!editingBasketKey) return;
  const item = getBasket().find((b) => b.key === editingBasketKey);
  const service = activeService();
  if (!item || !service) return;
  for (const g of service.optionGroups) {
    const v = item.optionValues?.[g.key];
    if (v == null) continue;
    if (g.type === "date" || g.type === "time" || g.type === "text") {
      const el = document.getElementById(`opt-${service.id}-${g.key}`);
      if (el) el.value = v;
    } else if (g.type === "datetime") {
      const dEl = document.getElementById(`opt-${service.id}-${g.key}-date`);
      const tEl = document.getElementById(`opt-${service.id}-${g.key}-time`);
      if (dEl) dEl.value = v.date || "";
      if (tEl) tEl.value = v.time || "";
    }
  }
}

export function confirmAddToBasket(lang) {
  const service = activeService();
  if (!service) return returnRoute;
  const values = collectDraftValues(service, draft);
  const summary = summarizeDraft(service, values, lang);
  const price = draftPrice(service, values);
  const payload = { serviceId: service.id, category: service.category, serviceName: service.name, summary, price, optionValues: values };
  if (editingBasketKey) updateBasketItem(editingBasketKey, payload);
  else storeAddToBasket(payload);
  const to = returnRoute;
  activeServiceId = null;
  editingBasketKey = null;
  return to;
}

export function serviceDetailView({ lang }) {
  const service = activeService();
  if (!service) return "";
  return `
    ${renderBackHeader({ lang, labelKey: "serviceSectionLabel" })}
    <main>
      <div class="detail-grid">
        <div class="title-block">
          <span class="rule"></span>
          <h1 lang="${lang}">${escapeHtml(tf(service.name, lang))}</h1>
          <span class="rule"></span>
          <p class="desc" lang="${lang}">${escapeHtml(tf(service.shortDesc, lang))}</p>
          <div class="pill-row">
            <span class="pill gold">${abPrice(service, lang)}</span>
          </div>
        </div>
        <div class="form-stack">
          ${service.optionGroups.map((g) => renderOptionGroup(service, g, draft, lang)).join("")}
        </div>
      </div>
      <div class="form-footer bar">
        <button class="btn-primary" data-action="add-to-basket">${t("addToBasketBtn", lang)}</button>
        <div class="fine-print" lang="${lang}">${t("basketDisclaimer", lang)}</div>
      </div>
    </main>`;
}
