// Fallblattanzeige — tablet welcome display mounted at a villa entrance.
// Standalone kiosk page (own HTML entry, own bootstrap) sharing the concierge
// app's Supabase-backed store and staff-gated room assignment, but with no
// routing and no guest interaction: it just cycles a split-flap board through
// a welcome message and the villa's booking data.
//
// The split-flap "flip" is a real DOM animation running on setInterval/
// setTimeout against DOM node references built once at mount time — NOT the
// rest of the app's "re-render via innerHTML" pattern, which would tear down
// and restart in-flight CSS transitions on every store update. See mountBoard().
import { getState, subscribe, isReady, initStore, getRoom, applyRoomFromUrl } from "./store.js";
import { setupActive, renderRoomSetup, initRoomSetup } from "./roomSetup.js";
import { vaseLogo } from "./logo.js";

const app = document.getElementById("app");

const LEN = 16;
const FLIP_MS = 260;
const STAGGER_MS = 40;
const EASE = "cubic-bezier(.2,.6,.2,1)";
const ROW_INTERVALS_MS = [4200, 5000, 5800, 6600];
const CLOCK_TICK_MS = 15000;
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

let room = getRoom();
let board = null; // built once by mountBoard(); see its own comment

function pad(s) {
  s = (s || "").toUpperCase().slice(0, LEN);
  const total = LEN - s.length;
  const left = Math.floor(total / 2);
  return " ".repeat(left) + s + " ".repeat(total - left);
}

function currentBooking() {
  return getState().bookings.find((b) => b.room === room) || null;
}

// The most recent staff-sent message addressed to this room's Fallblattanzeige
// (channel "fallblatt" on the same postcards table the guest takeover uses for
// channel "postcard" — see admin.js's "Mitteilung senden" page). null if none.
function activeFallblattMessage() {
  const list = getState().postcards.filter((p) => (p.room === room || p.room === "all") && p.channel === "fallblatt");
  if (!list.length) return null;
  return list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}

// Greedy word-wrap into up to `maxLines` lines of at most `lineLen` chars —
// a single word longer than lineLen is hard-truncated, matching the fixed-width
// board's existing truncation behaviour for over-long fixed copy (e.g. "Hua
// Hin · Thailand"). Anything beyond maxLines*lineLen is simply dropped.
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

// The two-message cycle for each of the four rows. At rest, row 1 (guest) and
// row 4 (bedrooms/feature) come from the villa's live booking row when
// available; row 3 is fixed resort copy (not a per-booking field, per the
// design spec). When staff have an active Fallblattanzeige message for this
// room, its word-wrapped lines replace each row's *second* variant, so the
// board keeps weaving between the normal info and the message rather than
// being fully taken over by it.
function buildRowsMsgs(booking, message) {
  const guest = booking?.guestName?.trim() || "Gast";
  const bedrooms = booking?.bedrooms ? `${booking.bedrooms} Schlafzimmer` : "3 Schlafzimmer";
  const feature = booking?.feature?.trim() || "Gartenpool";
  const defaults = [pad(guest), pad("Baan Chiang"), pad("Green Retreat"), pad(feature)];
  // A short message only needs one or two rows — the rest keep showing their
  // normal secondary info rather than going blank.
  const lines = message ? wrapMessage(message).map(pad) : [];
  const second = defaults.map((d, i) => lines[i] ?? d);
  return [
    [pad("Willkommen"), second[0]],
    [pad(room), second[1]],
    [pad("Hua Hin · Thailand"), second[2]],
    [pad(bedrooms), second[3]],
  ];
}

function fmtDate(now) {
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()}. ${MONTHS[now.getMonth()]}`;
}

function loadingScreen() {
  return `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;color:var(--sbc-copper);font-size:14px;">Lädt …</div>`;
}

function renderShell() {
  if (!isReady()) {
    app.innerHTML = loadingScreen();
    return;
  }
  if (setupActive()) {
    app.innerHTML = renderRoomSetup();
    return;
  }
  if (!board) mountBoard();
  updateLiveFields();
}

// Builds the frame + all 64 flap cells exactly once, keeping direct DOM
// references for the animation loop. Called again only after a hard
// navigation (room-setup confirms via location.href, not a re-render).
function mountBoard() {
  room = getRoom();
  const booking = currentBooking();
  const rowsMsgs = buildRowsMsgs(booking, activeFallblattMessage()?.text);

  app.innerHTML = `
    <div class="fb-stage" id="fb-stage">
      <div class="fb-frame">
        <div class="fb-header">
          <div class="fb-header-brand">${vaseLogo({ size: 32 })}<div class="fb-villa-label" id="fb-villa-label"></div></div>
          <div class="fb-weather" id="fb-weather"></div>
        </div>
        <div class="fb-board-wrap">
          <div class="fb-rule"></div>
          <div class="fb-rows" id="fb-rows"></div>
          <div class="fb-rule"></div>
        </div>
        <div class="fb-footer">
          <div id="fb-date"></div>
          <div id="fb-time"></div>
        </div>
      </div>
    </div>`;

  const rowsContainer = document.getElementById("fb-rows");
  const cellsEls = rowsMsgs.map((msgPair) => {
    const rowEl = document.createElement("div");
    rowEl.className = "fb-row";
    rowsContainer.appendChild(rowEl);
    return msgPair[0].split("").map((ch) => {
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

  board = { rowsMsgs, rowIdx: [0, 0, 0, 0], cellsEls, intervals: [], timers: [] };

  // The board is a fixed 1133x744 canvas that can exceed the viewport on a
  // smaller tablet — centre the scroll position explicitly rather than
  // relying on the flex container alone.
  const stage = document.getElementById("fb-stage");
  stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
  stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);

  board.intervals = ROW_INTERVALS_MS.map((ms, r) => setInterval(() => nextRow(r), ms));
  tickClock();
  board.intervals.push(setInterval(tickClock, CLOCK_TICK_MS));

  updateLiveFields();
}

function after(ms, fn) {
  board.timers.push(setTimeout(fn, ms));
}

function patchCell(r, i, patch) {
  const c = board.cellsEls[r][i];
  if (patch.flapScale !== undefined) c.flapEl.style.transform = `scaleY(${patch.flapScale})`;
  if (patch.flapTransition !== undefined) c.flapEl.style.transition = patch.flapTransition;
  if (patch.char !== undefined) {
    c.char = patch.char;
    c.topGlyph.textContent = patch.char;
    c.bottomGlyph.textContent = patch.char;
  }
  if (patch.flapChar !== undefined) c.flapGlyph.textContent = patch.flapChar;
}

// Same 2D scaleY fold as the design reference, deliberately not a 3D
// rotateX/backface-visibility flip — see Fallblattanzeige.dc.html's own note
// that a 3D version composited both faces on top of each other in some
// rendering pipelines. Cells within a row stagger left-to-right.
function nextRow(r) {
  const idx = (board.rowIdx[r] + 1) % board.rowsMsgs[r].length;
  board.rowIdx[r] = idx;
  const target = board.rowsMsgs[r][idx];
  target.split("").forEach((nextChar, i) => {
    const cell = board.cellsEls[r][i];
    if (!cell || cell.char === nextChar) return;
    after(i * STAGGER_MS, () => {
      patchCell(r, i, { flapScale: 0, flapTransition: `transform ${FLIP_MS}ms ${EASE}` });
      after(FLIP_MS, () => {
        patchCell(r, i, { char: nextChar, flapChar: nextChar, flapScale: 0, flapTransition: "none" });
        after(16, () => {
          patchCell(r, i, { flapScale: 1, flapTransition: `transform ${FLIP_MS}ms ${EASE}` });
        });
      });
    });
  });
}

function tickClock() {
  const now = new Date();
  const dateEl = document.getElementById("fb-date");
  const timeEl = document.getElementById("fb-time");
  if (dateEl) dateEl.textContent = fmtDate(now);
  if (timeEl) timeEl.textContent = now.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

// Refreshes the always-safe-to-touch text (header) on every store update, and
// re-derives each row's message pair so the *next* flip picks up fresh
// booking data — without touching cells mid-animation.
function updateLiveFields() {
  const booking = currentBooking();
  const villaLabel = document.getElementById("fb-villa-label");
  const weatherEl = document.getElementById("fb-weather");
  if (villaLabel) villaLabel.textContent = room.toUpperCase();
  if (weatherEl) weatherEl.textContent = (booking?.weatherNote || "").toUpperCase();
  if (board) board.rowsMsgs = buildRowsMsgs(booking, activeFallblattMessage()?.text);
}

subscribe(renderShell);
renderShell();
initStore().then(() => {
  if (applyRoomFromUrl()) room = getRoom();
  renderShell();
});
initRoomSetup(renderShell);
