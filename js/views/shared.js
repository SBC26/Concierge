// Shared helpers for the guest-facing views: price/date formatting and the
// generic option-group engine that drives the Service-Detail screen for all
// nine service categories from one data-driven template.
import { t, tv, tf, LANGS } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { vaseLogo, wordmarkLogo } from "../logo.js";

function langSwitcher(lang) {
  return `<div class="lang-switch">${LANGS.map((l) => `<button class="lang-btn ${l === lang ? "active" : ""}" data-action="set-lang" data-lang="${l}">${l.toUpperCase()}</button>`).join("")}</div>`;
}

function basketLink(lang, count) {
  return `<button class="basket-link" data-action="nav" data-route="basket">${vaseLogo({ size: 18 })} ${t("basketSectionLabel", lang)} · ${count}</button>`;
}

// Brand chrome shown only on the Start screen.
export function renderBrandHeader(lang) {
  return `
  <div class="topbar">
    <div class="topbar-row">
      <div class="brand-name">
        ${lang === "th" ? `<div style="display:flex;align-items:center;gap:10px;">${vaseLogo({ size: 30 })}<span class="brand-word" lang="${lang}">${escapeHtml(t("hotelName", lang))}</span></div>` : wordmarkLogo({ height: 24 })}
      </div>
      <div class="chip-row">${langSwitcher(lang)}</div>
    </div>
  </div>`;
}

// Back-header shown on every other screen: back arrow + section label,
// optionally the basket link (used on tablet per the design spec).
export function renderBackHeader({ lang, labelKey, label, showBasket = false, basketCount = 0 }) {
  return `
  <div class="back-header">
    <button class="back-btn" data-action="go-home">${icon("arrowLeft", { size: 20 })}</button>
    <span class="section-label">${escapeHtml(label || t(labelKey, lang))}</span>
    ${showBasket && basketCount > 0 ? basketLink(lang, basketCount) : ""}
    <div class="chip-row">${langSwitcher(lang)}</div>
  </div>`;
}

export function chf(n) {
  return `CHF ${Math.round(n)}`;
}

export function abPrice(service, lang) {
  if (service.fromPrice == null) return t("inclusiveLabel", lang);
  const unit = service.priceUnit ? ` / ${t("perDayUnit", lang)}` : "";
  return `${t("fromPricePrefix", lang)} ${chf(service.fromPrice)}${unit}`;
}

export function fmtDateShort(dateStr, lang) {
  if (!dateStr) return "";
  const locale = lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

// Reactive-state groups (click-driven: no focus to lose on re-render).
const REACTIVE_TYPES = new Set(["segmented", "choice-list", "stepper"]);

export function optionFieldId(serviceId, groupKey, sub) {
  return `opt-${serviceId}-${groupKey}${sub ? "-" + sub : ""}`;
}

// Reads every group's current value: reactive types come from `draft`
// (kept in JS state so selections re-render immediately), text/date/time
// types are read straight from the DOM at submit time so typing never
// fights a full innerHTML re-render.
export function collectDraftValues(service, draft) {
  const values = {};
  for (const g of service.optionGroups || []) {
    if (REACTIVE_TYPES.has(g.type)) {
      values[g.key] = draft[g.key];
    } else if (g.type === "datetime") {
      const date = document.getElementById(optionFieldId(service.id, g.key, "date"))?.value || "";
      const time = document.getElementById(optionFieldId(service.id, g.key, "time"))?.value || "";
      values[g.key] = date || time ? { date, time } : null;
    } else {
      values[g.key] = document.getElementById(optionFieldId(service.id, g.key))?.value || "";
    }
  }
  return values;
}

function optionByValue(group, value) {
  return (group.options || []).find((o) => o.value === value);
}

export function draftPrice(service, values) {
  let total = 0;
  let any = false;
  for (const g of service.optionGroups || []) {
    const v = values[g.key];
    if (v == null || v === "") continue;
    if (g.type === "choice-list" && g.multi) {
      for (const val of v) {
        const opt = optionByValue(g, val);
        if (opt?.price != null) { total += opt.price; any = true; }
      }
    } else if (g.type === "segmented" || g.type === "choice-list") {
      const opt = optionByValue(g, v);
      if (opt?.price != null) { total += opt.price; any = true; }
    }
  }
  if (any) return total;
  return service.fromPrice ?? null;
}

export function summarizeDraft(service, values, lang) {
  const parts = [];
  for (const g of service.optionGroups || []) {
    const v = values[g.key];
    if (v == null || v === "") continue;
    if (g.type === "segmented" || (g.type === "choice-list" && !g.multi)) {
      const opt = optionByValue(g, v);
      if (opt) parts.push(tf(opt.label, lang));
    } else if (g.type === "choice-list" && g.multi) {
      if (v.length) parts.push(v.map((val) => tf(optionByValue(g, val)?.label, lang)).filter(Boolean).join(", "));
    } else if (g.type === "date") {
      parts.push(fmtDateShort(v, lang));
    } else if (g.type === "time") {
      parts.push(v);
    } else if (g.type === "datetime") {
      if (v.date || v.time) parts.push([fmtDateShort(v.date, lang), v.time].filter(Boolean).join(", "));
    } else if (g.type === "stepper") {
      parts.push(`${v} ${tf(g.label, lang).toLowerCase()}`);
    } else if (g.type === "text") {
      if (v) parts.push(v.length > 60 ? v.slice(0, 57) + "…" : v);
    }
  }
  return parts.join(" · ");
}

// ---------- rendering ----------
export function renderOptionGroup(service, group, draft, lang) {
  const label = `<span class="section-label">${escapeHtml(tf(group.label, lang))}</span>`;
  const helper = group.helper ? `<div class="helper">${escapeHtml(tf(group.helper, lang))}</div>` : "";
  let control = "";

  if (group.type === "segmented") {
    control = `<div class="segmented">${(group.options || [])
      .map((o) => `<button type="button" data-action="opt-set" data-key="${group.key}" data-value="${o.value}" class="${draft[group.key] === o.value ? "selected" : ""}">${escapeHtml(tf(o.label, lang))}</button>`)
      .join("")}</div>`;
  } else if (group.type === "choice-list") {
    const selected = group.multi ? draft[group.key] || [] : draft[group.key];
    control = (group.options || [])
      .map((o) => {
        const isSel = group.multi ? selected.includes(o.value) : selected === o.value;
        return `<div class="choice-row ${isSel ? "selected" : ""}" data-action="${group.multi ? "opt-toggle" : "opt-set"}" data-key="${group.key}" data-value="${o.value}">
          <span class="label">${o.icon ? icon(o.icon, { size: 18 }) : ""}${escapeHtml(tf(o.label, lang))}</span>
          <span style="display:flex;align-items:center;gap:10px;">
            ${o.price != null ? `<span class="price">${chf(o.price)}</span>` : ""}
            <span class="check-circle">${isSel ? icon("check", { size: 11 }) : ""}</span>
          </span>
        </div>`;
      })
      .join("");
  } else if (group.type === "date") {
    control = `<input type="date" class="field-input" id="${optionFieldId(service.id, group.key)}" />`;
  } else if (group.type === "time") {
    control = `<input type="time" class="field-input" id="${optionFieldId(service.id, group.key)}" />`;
  } else if (group.type === "datetime") {
    control = `<div class="field-row-2">
      <input type="date" class="field-input" id="${optionFieldId(service.id, group.key, "date")}" />
      <input type="time" class="field-input" id="${optionFieldId(service.id, group.key, "time")}" />
    </div>`;
  } else if (group.type === "text") {
    control = group.multiline
      ? `<textarea class="field-input" id="${optionFieldId(service.id, group.key)}" placeholder="…"></textarea>`
      : `<input type="text" class="field-input" id="${optionFieldId(service.id, group.key)}" placeholder="…" />`;
  } else if (group.type === "stepper") {
    const val = draft[group.key] ?? group.default ?? group.min ?? 1;
    control = `<div class="stepper-row">
      <button type="button" class="minus" data-action="opt-step" data-key="${group.key}" data-dir="-1" ${val <= (group.min ?? 1) ? "disabled" : ""}>${icon("minus", { size: 14 })}</button>
      <span class="value">${val}</span>
      <button type="button" class="plus" data-action="opt-step" data-key="${group.key}" data-dir="1" ${val >= (group.max ?? 99) ? "disabled" : ""}>${icon("plus", { size: 14 })}</button>
    </div>`;
  }

  return `<div class="form-group">${label}${control}${helper}</div>`;
}
