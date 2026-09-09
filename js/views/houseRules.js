// Hausregeln & WLAN — network access, house rules, emergency contacts.
import { getState } from "../store.js";
import { t, tv } from "../i18n.js";
import { icon } from "../icons.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader } from "./shared.js";

export function houseRulesView({ lang }) {
  const c = getState().content;
  const rules = c.rules[lang] || c.rules.de || [];
  return `
    ${renderBackHeader({ lang, labelKey: "houseRulesTitle" })}
    <main>
      <div class="title-block" style="padding-top:24px;">
        <h1 lang="${lang}" style="font-size:28px;">${t("houseRulesTitle", lang)}</h1>
      </div>
      <div class="wlan-card" style="margin-top:20px;">
        <span class="section-label">${t("wlanLabel", lang)}</span>
        <div class="wlan-kv"><div class="label">${t("networkLabel", lang)}</div><div class="value">${escapeHtml(c.wifiSsid)}</div></div>
        <div class="wlan-kv"><div class="label">${t("passwordLabel", lang)}</div><div class="value">${escapeHtml(c.wifiPassword)}</div></div>
        <button class="btn-inline-gold" data-action="copy-text" data-text="${escapeHtml(c.wifiPassword)}">${icon("copy", { size: 15 })} ${t("copyPasswordBtn", lang)}</button>
      </div>
      ${rules.map((r) => `<div class="rule-block"><div class="body" lang="${lang}">${escapeHtml(r)}</div></div>`).join("")}
      <div class="emergency-card">
        <span class="section-label">${t("emergencyLabel", lang)}</span>
        <div class="body">${escapeHtml(c.conciergeName)} ${escapeHtml(c.conciergePhone)} · ${escapeHtml(c.emergencyHospital)} · ${escapeHtml(t("emergencyNumberLabel", lang))} ${escapeHtml(c.emergencyNumber)}</div>
      </div>
    </main>`;
}
