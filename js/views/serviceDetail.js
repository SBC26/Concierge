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
// Keys of required groups the guest tried to submit without filling in —
// cleared on every open and on every successful submit attempt.
let missingRequired = new Set();

export function openService(id, fromRoute = "home") {
  activeServiceId = id;
  draft = {};
  editingBasketKey = null;
  returnRoute = fromRoute;
  missingRequired = new Set();
}

export function openServiceForEdit(basketKey) {
  const item = getBasket().find((b) => b.key === basketKey);
  if (!item) return;
  activeServiceId = item.serviceId;
  editingBasketKey = basketKey;
  returnRoute = "basket";
  const service = getService(item.serviceId);
  draft = {};
  missingRequired = new Set();
  for (const g of service?.optionGroups || []) {
    if (g.type === "segmented" || g.type === "stepper" || (g.type === "choice-list" && !g.multi)) draft[g.key] = item.optionValues?.[g.key];
    else if (g.type === "choice-list" && g.multi) draft[g.key] = item.optionValues?.[g.key] || [];
  }
}

export function activeService() {
  return activeServiceId ? getService(activeServiceId) : null;
}

// optSet/optToggle/optStep each trigger a full re-render (app.js's "opt-*"
// actions call render() straight after). renderOptionGroup() rebuilds every
// group's markup from scratch, including date/time/text fields — which live
// in the DOM, not in `draft`, while the guest is typing (so keystrokes don't
// fight a re-render). Without this sync, picking e.g. a segmented option in
// one group would wipe out whatever the guest had already typed into a text
// field in another group, since the fresh render had no way to know it was
// there. Called at the top of every reactive-field setter, before the value
// change that's about to trigger that re-render.
function syncDomFieldsIntoDraft() {
  const service = activeService();
  if (!service) return;
  const values = collectDraftValues(service, draft);
  for (const g of service.optionGroups || []) {
    if (g.type === "date" || g.type === "time" || g.type === "datetime" || g.type === "text") {
      draft[g.key] = values[g.key];
    }
  }
}

export function optStep(key, dir) {
  syncDomFieldsIntoDraft();
  const service = activeService();
  const group = service?.optionGroups.find((g) => g.key === key);
  if (!group) return;
  const cur = draft[key] ?? group.default ?? group.min ?? 1;
  const next = Math.max(group.min ?? 1, Math.min(group.max ?? 99, cur + Number(dir)));
  draft[key] = next;
}

export function optSet(key, value) {
  syncDomFieldsIntoDraft();
  draft[key] = value;
  missingRequired.delete(key);
}

export function optToggle(key, value) {
  syncDomFieldsIntoDraft();
  const cur = draft[key] || [];
  draft[key] = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  if (draft[key].length) missingRequired.delete(key);
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

// What counts as "empty" differs per type — a stepper always carries some
// number (its default), so it's really only text/date/time/datetime/
// segmented/choice-list that can meaningfully be missing.
function isValueMissing(group, value) {
  switch (group.type) {
    case "text":
    case "date":
    case "time":
      return !value || !String(value).trim();
    case "datetime":
      return !value || !value.date || !value.time;
    case "segmented":
      return value == null || value === "";
    case "choice-list":
      return group.multi ? !(value && value.length) : value == null || value === "";
    default:
      return false;
  }
}

export function confirmAddToBasket(lang) {
  const service = activeService();
  if (!service) return returnRoute;
  const values = collectDraftValues(service, draft);
  const missing = (service.optionGroups || []).filter((g) => g.required && isValueMissing(g, values[g.key]));
  if (missing.length) {
    missingRequired = new Set(missing.map((g) => g.key));
    return null;
  }
  missingRequired = new Set();
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
          ${service.optionGroups.map((g) => renderOptionGroup(service, g, draft, lang, missingRequired.has(g.key))).join("")}
        </div>
      </div>
      <div class="form-footer bar">
        ${missingRequired.size ? `<p class="error-text" lang="${lang}">${escapeHtml(t("requiredFieldsError", lang))}</p>` : ""}
        <button class="btn-primary" data-action="add-to-basket">${t("addToBasketBtn", lang)}</button>
        <div class="fine-print" lang="${lang}">${t("basketDisclaimer", lang)}</div>
      </div>
    </main>`;
}
