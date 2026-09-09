// Umgebung — curated local recommendations with an optional tag filter.
import { getState } from "../store.js";
import { t, tf } from "../i18n.js";
import { escapeHtml } from "../util.js";
import { renderBackHeader } from "./shared.js";

let activeFilter = "all";
export function setSurroundingsFilter(tag) {
  activeFilter = tag;
}

export function surroundingsView({ lang }) {
  const c = getState().content;
  const tips = c.localTips || [];
  const tags = [...new Set(tips.flatMap((tip) => tip.tags || []))];

  return `
    ${renderBackHeader({ lang, labelKey: "secNavSurroundings" })}
    <main>
      <div class="title-block" style="padding-top:24px;">
        <h1 lang="${lang}" style="font-size:28px;">${t("surroundingsTitle", lang)}</h1>
        <p class="desc" lang="${lang}">${t("surroundingsIntro", lang)}</p>
      </div>
      ${
        tags.length > 0
          ? `<div class="chip-filter-row" style="margin-top:20px;">
              <button class="chip-filter ${activeFilter === "all" ? "active" : ""}" data-action="filter-tips" data-tag="all">${t("filterAll", lang)}</button>
              ${tags.map((tag) => `<button class="chip-filter ${activeFilter === tag ? "active" : ""}" data-action="filter-tips" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join("")}
            </div>`
          : ""
      }
      <div style="margin-top:20px;">
        ${tips
          .filter((tip) => activeFilter === "all" || (tip.tags || []).includes(activeFilter))
          .map((tip) => placeCard(tip, lang, c.conciergePhone))
          .join("")}
      </div>
    </main>`;
}

function placeCard(tip, lang, conciergePhone) {
  const name = tf(tip.title, lang);
  const actionLabel = tf(tip.actionLabel, lang);
  const waHref = conciergePhone ? `https://wa.me/${conciergePhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(name)}` : null;
  return `
    <div class="place-card">
      <div class="row-between">
        <span class="name" lang="${lang}">${escapeHtml(name)}</span>
        ${tip.travelTime ? `<span class="time">${escapeHtml(tip.travelTime)}</span>` : ""}
      </div>
      <p class="desc" lang="${lang}">${escapeHtml(tf(tip.desc, lang))}</p>
      ${actionLabel && waHref ? `<a class="action" href="${waHref}" target="_blank" rel="noopener">${escapeHtml(actionLabel)}</a>` : ""}
    </div>`;
}
