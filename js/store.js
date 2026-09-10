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
    conciergeName: "", conciergePhone: "", emergencyHospital: "", emergencyNumber: "",
    postcardFooterDefault: "",
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
  bookings: [],
  services: [],
  requests: [],
  requestItems: [],
};
const listeners = new Set();
const newOrderListeners = new Set();
const newRequestListeners = new Set();
let ready = false;
let basket = [];

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
// Separate from subscribe()/notify(): fires only for orders a guest just placed
// (real INSERT events), not for the initial load or status-change updates —
// used by the backoffice to trigger a sound/notification exactly once per order.
export function onNewOrder(fn) {
  newOrderListeners.add(fn);
  return () => newOrderListeners.delete(fn);
}
// Same idea as onNewOrder(), for the new request_items table (Anfragekorb submissions).
export function onNewRequest(fn) {
  newRequestListeners.add(fn);
  return () => newRequestListeners.delete(fn);
}

// ---------- mappers: snake_case DB rows <-> the app's existing camelCase shape ----------
const ts = (iso) => (iso ? new Date(iso).getTime() : Date.now());

function mapContent(row) {
  return {
    wifiSsid: row.wifi_ssid, wifiPassword: row.wifi_password,
    breakfastHours: row.breakfast_hours, restaurantHours: row.restaurant_hours, spaHours: row.spa_hours,
    checkin: row.checkin, checkout: row.checkout, receptionPhone: row.reception_phone,
    welcome: row.welcome || {}, rules: row.rules || {}, localTips: row.local_tips || [],
    conciergeName: row.concierge_name || "", conciergePhone: row.concierge_phone || "",
    emergencyHospital: row.emergency_hospital || "", emergencyNumber: row.emergency_number || "",
    postcardFooterDefault: row.postcard_footer_default || "",
  };
}
export const mapMenuItem = (r) => ({ id: r.id, category: r.category, price: Number(r.price), name: r.name, desc: r.description, sortOrder: r.sort_order });
const mapMenuCategory = (r) => ({ id: r.id, label: r.label, sortOrder: r.sort_order });
export const mapHousekeeping = (r) => ({ id: r.id, icon: r.icon, name: r.name, sortOrder: r.sort_order });
export const mapSpaService = (r) => ({ id: r.id, name: r.name, duration: r.duration, price: Number(r.price), sortOrder: r.sort_order });
export const mapTaxiOption = (r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order });
export const mapExcursion = (r) => ({ id: r.id, price: Number(r.price), name: r.name, desc: r.description, sortOrder: r.sort_order });
const mapOrder = (r) => ({ id: r.id, room: r.room, type: r.type, items: r.items || [], note: r.note, total: r.total == null ? null : Number(r.total), status: r.status, createdAt: ts(r.created_at) });
const mapPostcard = (r) => ({ id: r.id, room: r.room, text: r.text, font: r.font, footer: r.footer || "", createdAt: ts(r.created_at) });

const mapBooking = (r) => ({
  room: r.room, bookingCode: r.booking_code, guestName: r.guest_name,
  arrival: r.arrival, departure: r.departure, guestsAdults: r.guests_adults, guestsChildren: r.guests_children,
  bedrooms: r.bedrooms, sizeSqm: r.size_sqm, feature: r.feature, cleaningSchedule: r.cleaning_schedule,
  depositStatus: r.deposit_status, address: r.address, weatherNote: r.weather_note, updatedAt: ts(r.updated_at),
});
export const mapService = (r) => ({
  id: r.id, category: r.category, name: r.name, shortDesc: r.short_desc,
  fromPrice: r.from_price == null ? null : Number(r.from_price), priceUnit: r.price_unit,
  optionGroups: r.option_groups || [], sortOrder: r.sort_order,
});
const mapRequest = (r) => ({ id: r.id, requestCode: r.request_code, room: r.room, message: r.message, richtwertTotal: Number(r.richtwert_total || 0), createdAt: ts(r.created_at) });
const mapRequestItem = (r) => ({
  id: r.id, requestId: r.request_id, serviceId: r.service_id, category: r.category,
  serviceName: r.service_name || {}, summary: r.summary, price: r.price == null ? null : Number(r.price),
  status: r.status, fulfillmentNote: r.fulfillment_note, createdAt: ts(r.created_at),
});

const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

// ---------- bootstrap: load everything once, then subscribe to live changes ----------
export async function initStore() {
  const [content, rooms, menuCategories, menu, housekeepingOptions, spaServices, taxiOptions, excursions, orders, postcards, bookings, services, requests, requestItems] = await Promise.all([
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
    supabase.from("bookings").select("*"),
    supabase.from("services").select("*").order("sort_order"),
    supabase.from("requests").select("*").order("created_at", { ascending: false }),
    supabase.from("request_items").select("*").order("created_at", { ascending: false }),
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
  state.bookings = (bookings.data || []).map(mapBooking);
  state.services = (services.data || []).map(mapService);
  state.requests = (requests.data || []).map(mapRequest);
  state.requestItems = (requestItems.data || []).map(mapRequestItem);

  basket = loadBasket();

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
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
      const order = mapOrder(p.new);
      upsertLocal(state.orders, order);
      notify();
      newOrderListeners.forEach((fn) => fn(order));
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (p) => {
      upsertLocal(state.orders, mapOrder(p.new));
      notify();
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" }, (p) => {
      removeLocal(state.orders, p.old.id);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "postcards" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.postcards, p.old.id);
      else upsertLocal(state.postcards, mapPostcard(p.new));
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (p) => {
      if (p.eventType === "DELETE") state.bookings = state.bookings.filter((b) => b.room !== p.old.room);
      else {
        const mapped = mapBooking(p.new);
        const i = state.bookings.findIndex((b) => b.room === mapped.room);
        if (i === -1) state.bookings.push(mapped);
        else state.bookings[i] = mapped;
      }
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "services" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.services, p.old.id);
      else upsertLocal(state.services, mapService(p.new));
      state.services.sort(byOrder);
      notify();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, (p) => {
      if (p.eventType === "DELETE") removeLocal(state.requests, p.old.id);
      else upsertLocal(state.requests, mapRequest(p.new));
      notify();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "request_items" }, (p) => {
      const item = mapRequestItem(p.new);
      upsertLocal(state.requestItems, item);
      notify();
      newRequestListeners.forEach((fn) => fn(item));
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "request_items" }, (p) => {
      upsertLocal(state.requestItems, mapRequestItem(p.new));
      notify();
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "request_items" }, (p) => {
      removeLocal(state.requestItems, p.old.id);
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
  return localStorage.getItem(ROOM_KEY) || state.rooms[0] || "Villa Jungfrau";
}
export function setRoom(room) {
  const changed = hasAssignedRoom() && localStorage.getItem(ROOM_KEY) !== room;
  localStorage.setItem(ROOM_KEY, room);
  if (changed) clearBasket(); // a device reassigned to a different villa starts with an empty basket
}
// Whether this device has actually been assigned a room (vs. just falling
// back to the first room in getRoom()) — used to gate the one-time setup screen.
export function hasAssignedRoom() {
  return localStorage.getItem(ROOM_KEY) !== null;
}

// Guests scan a per-room QR code (index.html?room=Villa+Jungfrau) on their own phone and
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
  const { data, error } = await supabase.from("postcards").insert({ room: postcard.room, text: postcard.text, font: postcard.font, footer: postcard.footer || null }).select().single();
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
// Deletes one sent postcard — also removes it from any guest device that
// hasn't dismissed it yet (postcardsForRoom() no longer returns it, and the
// realtime DELETE event does the same on other open tabs), i.e. doubles as "undo send".
export async function deletePostcard(id) {
  removeLocal(state.postcards, id);
  notify();
  await deleteRow("postcards", id);
}
export async function clearPostcards() {
  const ids = state.postcards.map((p) => p.id);
  state.postcards.length = 0;
  notify();
  if (ids.length) {
    const { error } = await supabase.from("postcards").delete().in("id", ids);
    if (error) console.error("clearPostcards failed", error);
  }
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

// ---------- booking (current stay per villa) ----------
export function getBooking(room) {
  return state.bookings.find((b) => b.room === room) || null;
}
// bookings.room (not id) is the primary key, so it needs its own update helper
// instead of the generic updateRow(table, id, patch).
export async function updateBookingRow(room, patch) {
  const { error } = await supabase.from("bookings").update(patch).eq("room", room);
  if (error) console.error("updateBookingRow failed", error);
}

// ---------- services catalog ----------
export function servicesByCategory() {
  return state.services;
}
export function getService(id) {
  return state.services.find((s) => s.id === id) || null;
}

// ---------- basket (Anfragekorb draft — transient, persisted per-device across reloads) ----------
const BASKET_KEY = "sbc_basket";
function loadBasket() {
  try {
    return JSON.parse(localStorage.getItem(BASKET_KEY) || "[]");
  } catch {
    return [];
  }
}
function persistBasket() {
  localStorage.setItem(BASKET_KEY, JSON.stringify(basket));
}
export function getBasket() {
  return basket;
}
export function addToBasket(item) {
  basket = [...basket, { key: crypto.randomUUID(), ...item }];
  persistBasket();
  notify();
}
export function updateBasketItem(key, item) {
  basket = basket.map((b) => (b.key === key ? { ...b, ...item } : b));
  persistBasket();
  notify();
}
export function removeFromBasket(key) {
  basket = basket.filter((b) => b.key !== key);
  persistBasket();
  notify();
}
export function clearBasket() {
  basket = [];
  persistBasket();
  notify();
}
export function basketTotal() {
  return basket.reduce((sum, b) => sum + (b.price || 0), 0);
}

// ---------- requests (submitted baskets) ----------
export async function submitRequest({ room, message, lines }) {
  const requestCode = `SBC-${Math.floor(1000 + Math.random() * 9000)}`;
  const total = lines.reduce((sum, l) => sum + (l.price || 0), 0);
  const { data: request, error } = await supabase
    .from("requests")
    .insert({ request_code: requestCode, room, message: message || null, richtwert_total: total })
    .select()
    .single();
  if (error) {
    console.error("submitRequest failed", error);
    return null;
  }
  const itemRows = lines.map((l) => ({
    request_id: request.id,
    service_id: l.serviceId,
    category: l.category,
    service_name: l.serviceName,
    summary: l.summary,
    price: l.price ?? null,
  }));
  const { data: items, error: itemsError } = await supabase.from("request_items").insert(itemRows).select();
  if (itemsError) {
    console.error("submitRequest (items) failed", itemsError);
    return null;
  }
  upsertLocal(state.requests, mapRequest(request));
  items.forEach((row) => upsertLocal(state.requestItems, mapRequestItem(row)));
  clearBasket();
  notify();
  return mapRequest(request);
}
export async function setRequestItemStatus(id, status, fulfillmentNote) {
  const patch = { status };
  if (fulfillmentNote !== undefined) patch.fulfillment_note = fulfillmentNote;
  const item = state.requestItems.find((i) => i.id === id);
  if (item) {
    item.status = status;
    if (fulfillmentNote !== undefined) item.fulfillmentNote = fulfillmentNote;
    notify();
  }
  await updateRow("request_items", id, patch);
}
export function requestsForRoom(room) {
  const ids = new Set(state.requests.filter((r) => r.room === room).map((r) => r.id));
  return state.requestItems.filter((i) => ids.has(i.requestId)).sort((a, b) => b.createdAt - a.createdAt);
}
export function requestById(id) {
  return state.requests.find((r) => r.id === id) || null;
}
export function requestItemsFor(requestId) {
  return state.requestItems.filter((i) => i.requestId === requestId);
}
