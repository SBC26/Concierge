// Idle / start screen — the guest tablet's resting state, shown on first load
// and restored automatically after 2 minutes without interaction (see app.js).
// Per room, staff choose one of two modes (rooms.idle_mode, "Buchungen" editor):
//
//   "postcard"  — the most recent staff-sent postcard-channel message, shown
//                 persistently (not a one-time dismiss-and-gone takeover
//                 anymore — it just *is* the idle screen). Falls back to a
//                 generic branded greeting if none was ever sent.
//   "fallblatt" — a split-flap ("Solari board") display cycling through
//                 pages: the villa's booking info, plus one page per active
//                 fallblatt-channel message (admin.js "Mitteilung senden"),
//                 all sharing one staff-configurable page duration
//                 (content.fallblattPageSeconds).
//
// The split-flap mechanic itself (2D scaleY fold, staggered per cell) is a
// real DOM animation running on setInterval/setTimeout against DOM node
// references built once at mount time — NOT app.js's usual "re-render via
// innerHTML" pattern, which would tear down in-flight CSS transitions on
// every store update. mountFallblattBoard()/updateFallblattBoard()/
// unmountFallblattBoard() are app.js's hooks into that lifecycle.
import { t } from "../i18n.js";
import { getState } from "../store.js";
import { escapeHtml, postcardHTML } from "../util.js";
import { renderBrandHeader } from "./shared.js";

const LEN = 16;
const FLIP_MS = 260;
const STAGGER_MS = 35;
const ROW_STAGGER_MS = 120;
const EASE = "cubic-bezier(.2,.6,.2,1)";

function pad(s) {
  s = (s || "").toUpperCase().slice(0, LEN);
  const total = LEN - s.length;
  const left = Math.floor(total / 2);
  return " ".repeat(left) + s + " ".repeat(total - left);
}

// Greedy word-wrap into up to `maxLines` lines of at most `lineLen` chars —
// a single word longer than lineLen is hard-truncated. Anything beyond
// maxLines*lineLen is simply dropped (matches the board's other fixed-width
// truncation, e.g. "Hua Hin · Thailand" already doesn't fit in one line).
function wrapMessage(text, lineLen = LEN, maxLines = 4) {
  const words = (text || "")
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > lineLen ? w.slice(0, lineLen) : w));
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= lineLen) {
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

// ---------- Postcard idle screen ----------
export function idlePostcardHTML({ lang, room }) {
  const s = getState();
  const pending = [...s.postcards]
    .filter((p) => (p.room === room || p.room === "all") && p.channel !== "fallblatt")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const booking = s.bookings.find((b) => b.room === room);
  const guestName = booking?.guestName?.trim() || "";

  const message = pending ? pending.text : guestName ? `Hallo ${guestName}, willkommen im Swiss Baan Chiang!` : "Willkommen im Swiss Baan Chiang!";
  const createdAt = pending?.createdAt ?? Date.now();
  const dateStr = new Date(createdAt).toLocaleDateString(lang === "de" ? "de-CH" : lang === "th" ? "th-TH" : "en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  // No extra "Villa" label here — every room name in this property already
  // starts with it (Villa Jungfrau, Villa Rigi, …), so prefixing the generic
  // label would read as "Villa Villa Rigi".
  const footerHtml = pending?.footer
    ? escapeHtml(pending.footer)
    : `${escapeHtml(t("postcardFrom", lang))} ${escapeHtml(t("hotelName", lang))} · ${escapeHtml(room)} · ${dateStr}`;

  return `
    <div class="idle-screen" data-action="idle-enter">
      ${renderBrandHeader(lang)}
      <main class="postcard-takeover">
        ${postcardHTML({ idPrefix: "idle", message, fontId: pending?.font, placeholder: "", footerHtml })}
        <p class="idle-hint">${escapeHtml(t("idleHint", lang))}</p>
      </main>
    </div>`;
}

// ---------- Fallblattanzeige idle screen ----------
let board = null; // { room, pages, pageIdx, cellsEls, timer, timeouts }

function activeFallblattMessages(room) {
  return getState()
    .postcards.filter((p) => (p.room === room || p.room === "all") && p.channel === "fallblatt")
    .sort((a, b) => a.createdAt - b.createdAt);
}

// While staff have at least one active Fallblattanzeige message for this
// room, the board shows *only* those — not the booking-info pages — per
// explicit request: sending a message should replace the rotation, not add
// to it. The booking-info pages are just the fallback for an otherwise-empty
// board (a villa where nothing has ever been sent).
function buildPages(room, booking, messages) {
  if (messages.length) {
    return messages.map((msg) => {
      const lines = wrapMessage(msg.text).map(pad);
      while (lines.length < 4) lines.push(pad(""));
      return lines;
    });
  }
  const guest = booking?.guestName?.trim() || "Gast";
  const bedrooms = booking?.bedrooms ? `${booking.bedrooms} Schlafzimmer` : "3 Schlafzimmer";
  const feature = booking?.feature?.trim() || "Gartenpool";
  return [
    [pad("Willkommen"), pad(room), pad("Hua Hin · Thailand"), pad(bedrooms)],
    [pad(guest), pad("Baan Chiang"), pad("Green Retreat"), pad(feature)],
  ];
}

function after(ms, fn) {
  board.timeouts.push(setTimeout(fn, ms));
}

function patchCell(r, i, patch) {
  const c = board.cellsEls[r]?.[i];
  if (!c) return;
  if (patch.flapScale !== undefined) c.flapEl.style.transform = `scaleY(${patch.flapScale})`;
  if (patch.flapTransition !== undefined) c.flapEl.style.transition = patch.flapTransition;
  if (patch.char !== undefined) {
    c.char = patch.char;
    c.topGlyph.textContent = patch.char;
    c.bottomGlyph.textContent = patch.char;
  }
  if (patch.flapChar !== undefined) c.flapGlyph.textContent = patch.flapChar;
}

// Same 2D scaleY fold as the original design reference, deliberately not a 3D
// rotateX/backface-visibility flip (that rendered incorrectly in some
// screenshot/flattening pipelines). All 4 rows advance together — cells
// stagger left-to-right within a row, and each row starts slightly after the
// one above it, for a top-to-bottom cascade across the whole page change.
function advancePage() {
  if (!board) return;
  board.pageIdx = (board.pageIdx + 1) % board.pages.length;
  const target = board.pages[board.pageIdx];
  target.forEach((rowStr, r) => {
    rowStr.split("").forEach((nextChar, i) => {
      const cell = board.cellsEls[r]?.[i];
      if (!cell || cell.char === nextChar) return;
      after(r * ROW_STAGGER_MS + i * STAGGER_MS, () => {
        patchCell(r, i, { flapScale: 0, flapTransition: `transform ${FLIP_MS}ms ${EASE}` });
        after(FLIP_MS, () => {
          patchCell(r, i, { char: nextChar, flapChar: nextChar, flapScale: 0, flapTransition: "none" });
          after(16, () => {
            patchCell(r, i, { flapScale: 1, flapTransition: `transform ${FLIP_MS}ms ${EASE}` });
          });
        });
      });
    });
  });
}

// Builds the frame + all 64 flap cells exactly once, keeping direct DOM
// references for the animation loop — app.js must call this only when no
// board is mounted yet, and must not touch `root`'s innerHTML again until
// unmountFallblattBoard() (see app.js's render()).
export function mountFallblattBoard(root, { room, lang }) {
  const s = getState();
  const booking = s.bookings.find((b) => b.room === room);
  const pages = buildPages(room, booking, activeFallblattMessages(room));
  const pageSeconds = s.content.fallblattPageSeconds || 8;

  root.innerHTML = `
    <div class="idle-screen" data-action="idle-enter">
      ${renderBrandHeader(lang)}
      <main class="fb-idle">
        <div class="fb-stage" id="fb-stage">
          <div class="fb-rule"></div>
          <div class="fb-rows" id="fb-rows"></div>
          <div class="fb-rule"></div>
        </div>
        <p class="idle-hint">${escapeHtml(t("idleHint", lang))}</p>
      </main>
    </div>`;

  const rowsContainer = root.querySelector("#fb-rows");
  const cellsEls = pages[0].map((rowStr) => {
    const rowEl = document.createElement("div");
    rowEl.className = "fb-row";
    rowsContainer.appendChild(rowEl);
    return rowStr.split("").map((ch) => {
      const cell = document.createElement("div");
      cell.className = "fb-cell";
      cell.innerHTML =
        '<div class="fb-cell-half fb-cell-top"><div class="fb-cell-glyph"></div></div>' +
        '<div class="fb-cell-half fb-cell-bottom"><div class="fb-cell-glyph"></div></div>' +
        '<div class="fb-cell-flap"><div class="fb-cell-glyph"></div></div>' +
        '<div class="fb-cell-seam"></div>';
      rowEl.appendChild(cell);
      const topGlyph = cell.querySelector(".fb-cell-top .fb-cell-glyph");
      const bottomGlyph = cell.querySelector(".fb-cell-bottom .fb-cell-glyph");
      const flapEl = cell.querySelector(".fb-cell-flap");
      const flapGlyph = flapEl.querySelector(".fb-cell-glyph");
      topGlyph.textContent = ch;
      bottomGlyph.textContent = ch;
      flapGlyph.textContent = ch;
      flapEl.style.transform = "scaleY(1)";
      flapEl.style.transition = "none";
      return { char: ch, topGlyph, bottomGlyph, flapEl, flapGlyph };
    });
  });

  board = { room, pages, pageIdx: 0, cellsEls, timer: null, timeouts: [] };

  // The board can be wider than a phone-width viewport — centre the scroll
  // position explicitly rather than relying on the flex container alone.
  const stage = root.querySelector("#fb-stage");
  stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);

  board.timer = setInterval(advancePage, Math.max(2, pageSeconds) * 1000);
}

// Re-derives the page set from fresh booking/message data without touching
// cells mid-animation — the *next* scheduled advancePage() picks it up.
export function updateFallblattBoard({ room }) {
  if (!board || board.room !== room) return;
  const s = getState();
  const booking = s.bookings.find((b) => b.room === room);
  board.pages = buildPages(room, booking, activeFallblattMessages(room));
  if (board.pageIdx >= board.pages.length) board.pageIdx = 0;
}

export function isFallblattBoardMounted(room) {
  return !!board && board.room === room;
}

export function unmountFallblattBoard() {
  if (!board) return;
  clearInterval(board.timer);
  board.timeouts.forEach(clearTimeout);
  board = null;
}
