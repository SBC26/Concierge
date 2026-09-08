// Shared state for Swiss Baan Chiang, backed by Supabase (Postgres + Realtime + Auth).
// Every open guest tablet and the back-office share one real database: staff writes
// go through Supabase, and Postgres Realtime pushes the change to every other open
// tab/device immediately — across different rooms and different physical devices,
// not just within one browser like the earlier localStorage prototype.
import { supabase } from "./supabaseClient.js";

const ROOM_KEY = "sbc_room";
const LANG_KEY = "sbc_lang";
const DISMISSED_POSTCARDS_KEY = "sbc_dismissed_postcards";

let state = {
  content: {
    wifiSsid: "", wifiPassword: "", breakfastHours: "", restaurantHours: "", spaHours: "",
    checkin: "", checkout: "", receptionPhone: "", welcome: {}, rules: {}, localTips: [],
  },
  rooms: [],
  menu: [],
  menuCategories: [],
  housekeepingOptions: [],
  spaServices: [],
  spaSlots: [],
  taxiOptions: [],
  excursions: [],
  orders: [],
  postcards: [],
};
const listeners = new Set();
let ready = false;

export function getState() {
  return state;
}
export function isReady() {
  return ready;
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => fn(state));
}

// ---------- mappers: snake_case DB rows <-> the app's existing camelCase shape ----------
const ts = (iso) => (iso ? new Date(iso).getTime() : Date.now());

function mapContent(row) {
  return {
    wifiSsid: row.wifi_ssid, wifiPassword: row.wifi_password,
    breakfastHours: row.breakfast_hours, restaurantHours: row.restaurant_hours, spaHours: row.spa_hours,
    checkin: row.checkin, checkout: row.checkout, receptionPhone: row.reception_phone,
    welcome: row.welcome || {}, rules: row.rules || {}, localTips: row.local_tips || [],
  };
}
export const mapMenuItem = (r) => ({ id: r.id, category: r.category, price: Number(r.price), name: r.name, desc: r.description, sortOrder: r.sort_order });
const mapMenuCategory = (r) => ({ id: r.id, label: r.label, sortOrder: r.sort_order });
const mapHousekeeping = (r) => ({ id: r.id, icon: r.icon, name: r.name, sortOrder: r.sort_order });
export const mapSpaService = (r) => ({ id: r.id, name: r.name, duration: r.duration, price: Number(r.price), sortOrder: r.sort_order });
export const mapTaxiOption = (r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order });
export const mapExcursion = (r) => ({ id: r.id, price: Number(r.price), name: r.name, desc: r.description, sortOrder: r.sort_order });
const mapOrder = (r) => ({ id: r.id, room: r.room, type: r.type, items: r.items || [], note: r.note, total: r.total == null ? null : Number(r.total), status: r.status, createdAt: ts(r.created_at) });
const mapPostcard = (r) => ({ id: r.id, room: r.room, text: r.text, font: r.font, createdAt: ts(r.created_at) });

const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

// ---------- bootstrap: load everything once, then subscribe to live changes ----------
export async function initStore() {
  const [content, rooms, menuCategories, menu, housekeepingOptions, spaServices, taxiOptions, excursions, orders, postcards] = await Promise.all([
    supabase.from("hotel_content").select("*").eq("id", 1).single(),
    supabase.from("rooms").select("*").order("sort_order"),
    supabase.from("menu_categories").select("*").order("sort_order"),
    supabase.from("menu_items").select("*").order("sort_order"),
    supabase.from("housekeeping_options").select("*").order("sort_order"),
    supabase.from("spa_services").select("*").order("sort_order"),
    supabase.from("taxi_options").select("*").order("sort_order"),
    supabase.from("excursions").select("*").order("sort_order"),
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
    supabase.from("postcards").select("*").order("created_at", { ascending: false }),
  ]);

  state.content = mapContent(content.data);
  state.rooms = rooms.data.map((r) => r.number);
  state.menuCategories = menuCategories.data.map(mapMenuCategory);
  state.menu = menu.data.map(mapMenuItem);
  state.housekeepingOptions = housekeepingOptions.data.map(mapHousekeeping);
  state.spaServices = spaServices.data.map(mapSpaService);
  state.spaSlots = content.data.spa_slots || [];
  state.taxiOptions = taxiOptions.data.map(mapTaxiOption);
  state.excursions = excursions.data.map(mapExcursion);
  state.orders = orders.data.map(mapOrder);
  state.postcards = postcards.data.map(mapPostcard);

  ready = true;
  notify();
  subscribeRealtime();
}

function upsertLocal(list, mapped) {
  const i = list.findIndex((x) => x.id === mapped.id);
  if (i === -1) list.unshift(mapped);
  else list[i] = mapped;
}
function removeLocal(list, id) {
  const i = list.findIndex((x) => x.id === id);
  if (i !== -1) list.splice(i, 1);
}

function subscribeRealtime() {
  supabase
    .channel("sbc-all-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "hotel_content" }, (p) => {
      if (p.eventType === "DELETE") return;
      state.content = mapContent(p.new);
      state.spaSlots = p.new.spa_slots || [];
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, (p) => {
      if (p.eventType === "DELETE") state.rooms = state.rooms.filter((n) => n !== p.old.number);
      else if (!state.rooms.includes(p.new.number)) state.rooms.push(p.new.number);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.menuCategories, p.old.id);
      else upsertLocal(state.menuCategories, mapMenuCategory(p.new));
      state.menuCategories.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.menu, p.old.id);
      else upsertLocal(state.menu, mapMenuItem(p.new));
      state.menu.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "housekeeping_options" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.housekeepingOptions, p.old.id);
      else upsertLocal(state.housekeepingOptions, mapHousekeeping(p.new));
      state.housekeepingOptions.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "spa_services" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.spaServices, p.old.id);
      else upsertLocal(state.spaServices, mapSpaService(p.new));
      state.spaServices.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "taxi_options" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.taxiOptions, p.old.id);
      else upsertLocal(state.taxiOptions, mapTaxiOption(p.new));
      state.taxiOptions.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "excursions" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.excursions, p.old.id);
      else upsertLocal(state.excursions, mapExcursion(p.new));
      state.excursions.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.orders, p.old.id);
      else upsertLocal(state.orders, mapOrder(p.new));
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "postcards" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.postcards, p.old.id);
      else upsertLocal(state.postcards, mapPostcard(p.new));
      notify();
    })
    .subscribe();
}

// ---------- generic write helpers (used by the admin content editor) ----------
export async function updateHotelContent(patch) {
  const { error } = await supabase.from("hotel_content").update(patch).eq("id", 1);
  if (error) console.error("updateHotelContent failed", error);
}
export async function updateRow(table, id, patch) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) console.error(`update ${table} failed`, error);
}
export async function insertRow(table, data) {
  const { data: row, error } = await supabase.from(table).insert(data).select().single();
  if (error) console.error(`insert ${table} failed`, error);
  return row;
}
export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error(`delete ${table} failed`, error);
}

// ---------- room + language (per-device, not synced) ----------
export function getRoom() {
  return localStorage.getItem(ROOM_KEY) || state.rooms[0] || "101";
}
export function setRoom(room) {
  localStorage.setItem(ROOM_KEY, room);
}
// Whether this device has actually been assigned a room (vs. just falling
// back to the first room in getRoom()) — used to gate the one-time setup screen.
export function hasAssignedRoom() {
  return localStorage.getItem(ROOM_KEY) !== null;
}

// Guests scan a per-room QR code (index.html?room=101) on their own phone and
// land straight in the app for that room, no staff login involved — but only
// on a device that has never been assigned a room yet. A tablet that already
// went through the staff-gated setup screen keeps its room even if someone
// opens (or forwards) a QR link on it; only index.html?setup=1 can change that.
export function applyRoomFromUrl() {
  if (hasAssignedRoom()) return false;
  const params = new URLSearchParams(location.search);
  const requested = params.get("room");
  if (!requested || !state.rooms.includes(requested)) return false;
  setRoom(requested);
  params.delete("room");
  const url = new URL(location.href);
  url.search = params.toString();
  history.replaceState({}, "", url);
  return true;
}
export function getRooms() {
  return state.rooms;
}
export function getLang() {
  return localStorage.getItem(LANG_KEY) || "de";
}
export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

// ---------- orders ----------
export async function addOrder(order) {
  const { data, error } = await supabase.from("orders").insert({ room: order.room, type: order.type, items: order.items, note: order.note ?? null, total: order.total ?? null }).select().single();
  if (error) {
    console.error("addOrder failed", error);
    return;
  }
  upsertLocal(state.orders, mapOrder(data));
  notify();
}
export async function setOrderStatus(id, status) {
  const o = state.orders.find((o) => o.id === id);
  if (o) {
    o.status = status;
    notify();
  }
  await updateRow("orders", id, { status });
}
export function ordersForRoom(room) {
  return state.orders.filter((o) => o.room === room);
}

// ---------- postcards (staff -> guest device greetings) ----------
export async function addPostcard(postcard) {
  const { data, error } = await supabase.from("postcards").insert({ room: postcard.room, text: postcard.text, font: postcard.font }).select().single();
  if (error) {
    console.error("addPostcard failed", error);
    return;
  }
  upsertLocal(state.postcards, mapPostcard(data));
  notify();
}
export function postcardsForRoom(room) {
  return state.postcards.filter((p) => p.room === "all" || p.room === room);
}

// Which postcards a guest device has already acknowledged — per-device, not synced.
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
