export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Font choices for staff-composed postcards. Each family stacks a Thai fallback
// so a message can mix Latin and Thai script and still render legibly.
export const FONT_OPTIONS = [
  { id: "elegant", family: "'Italiana', 'Noto Sans Thai', serif", label: "Elegant" },
  { id: "handwriting", family: "'Dancing Script', 'Noto Sans Thai', cursive", label: "Handschrift" },
  { id: "modern", family: "'Montserrat', 'Noto Sans Thai', sans-serif", label: "Modern" },
];
export const FONT_MAP = Object.fromEntries(FONT_OPTIONS.map((f) => [f.id, f.family]));

// Shared markup for the Swiss Baan Chiang postcard visual — used both for the
// staff compose-preview (admin.html) and the incoming greeting overlay (index.html),
// so the two always render identically. The frame (border, wordmark, hairline)
// is the client's own brand asset (assets/postcard-frame.png, exported from
// their design tool as "_Postkarte leer") rather than a hand-drawn CSS approximation.
export function postcardHTML({ idPrefix = "postcard", message, fontId, placeholder, footerHtml }) {
  const hasText = !!(message && message.trim());
  const fontFamily = FONT_MAP[fontId] || FONT_MAP.elegant;
  return `
    <div class="postcard-wrap">
      <div class="postcard">
        <div class="postcard-message ${hasText ? "" : "placeholder"}" id="${idPrefix}-message" style="${hasText ? `font-family:${fontFamily};` : ""}">${
    hasText ? escapeHtml(message) : escapeHtml(placeholder)
  }</div>
        <div class="postcard-footer" id="${idPrefix}-footer">${footerHtml}</div>
      </div>
    </div>`;
}
