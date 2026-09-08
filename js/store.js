// Shared, persisted state for Swiss Baan Chiang.
// In this prototype, localStorage + BroadcastChannel simulate a live backend:
// the back-office view (admin.html) writes content/order changes here, and
// every open guest tablet (index.html) reacts immediately — same as a real
// server push would, without needing an actual database yet.
import { DEFAULT_STATE, DEFAULT_ROOMS } from "./data.js";

const STORAGE_KEY = "sbc_state_v1";
const ROOM_KEY = "sbc_room";
const LANG_KEY = "sbc_lang";
const channel = "BroadcastChannel" in window ? new BroadcastChannel("sbc_sync") : null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.postcards = parsed.postcards || []; // migrate older saved state
      return parsed;
    }
  } catch (e) {
    console.warn("Could not read saved state, resetting.", e);
  }
  const fresh = structuredClone(DEFAULT_STATE);
  fresh.orders = [];
  fresh.postcards = [];
  return fresh;
}

let state = loadState();
const listeners = new Set();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  channel?.postMessage({ type: "state" });
}

function notify() {
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function updateState(mutator) {
  mutator(state);
  persist();
  notify();
}

if (channel) {
  channel.onmessage = (ev) => {
    if (ev.data?.type === "state") {
      state = loadState();
      notify();
    }
  };
}
window.addEventListener("storage", (ev) => {
  if (ev.key === STORAGE_KEY) {
    state = loadState();
    notify();
  }
});

// --- room + language (per-device, not synced) ---
export function getRoom() {
  return localStorage.getItem(ROOM_KEY) || DEFAULT_ROOMS[0];
}
export function setRoom(room) {
  localStorage.setItem(ROOM_KEY, room);
}
export function getRooms() {
  return DEFAULT_ROOMS;
}
export function getLang() {
  return localStorage.getItem(LANG_KEY) || "de";
}
export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

// --- orders ---
export function addOrder(order) {
  updateState((s) => {
    s.orders.unshift({
      id: "o" + Date.now() + Math.round(Math.random() * 999),
      status: "new",
      createdAt: Date.now(),
      ...order,
    });
  });
}

export function setOrderStatus(id, status) {
  updateState((s) => {
    const o = s.orders.find((o) => o.id === id);
    if (o) o.status = status;
  });
}

export function ordersForRoom(room) {
  return state.orders.filter((o) => o.room === room);
}

// --- postcards (staff → guest device greetings) ---
export function addPostcard(postcard) {
  updateState((s) => {
    s.postcards.unshift({
      id: "pc" + Date.now() + Math.round(Math.random() * 999),
      createdAt: Date.now(),
      ...postcard,
    });
  });
}

export function postcardsForRoom(room) {
  return state.postcards.filter((p) => p.room === "all" || p.room === room);
}

// Which postcards a guest device has already acknowledged — per-device, not synced.
const DISMISSED_POSTCARDS_KEY = "sbc_dismissed_postcards";
export function getDismissedPostcards() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_POSTCARDS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
export function dismissPostcard(id) {
  const set = getDismissedPostcards();
  set.add(id);
  localStorage.setItem(DISMISSED_POSTCARDS_KEY, JSON.stringify([...set]));
}
