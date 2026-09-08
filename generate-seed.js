// Generates seed SQL from js/data.js for the Supabase schema. Run with Node
// (data.js uses ESM export syntax, so this loads it via dynamic import).
import { DEFAULT_ROOMS, DEFAULT_STATE } from "./js/data.js";
import { writeFileSync } from "fs";

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}
function sqlJson(v) {
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}

const lines = [];

lines.push(`insert into hotel_content (id) values (1);`);

lines.push(`update hotel_content set
  wifi_ssid = ${sqlStr(DEFAULT_STATE.content.wifiSsid)},
  wifi_password = ${sqlStr(DEFAULT_STATE.content.wifiPassword)},
  breakfast_hours = ${sqlStr(DEFAULT_STATE.content.breakfastHours)},
  restaurant_hours = ${sqlStr(DEFAULT_STATE.content.restaurantHours)},
  spa_hours = ${sqlStr(DEFAULT_STATE.content.spaHours)},
  checkin = ${sqlStr(DEFAULT_STATE.content.checkin)},
  checkout = ${sqlStr(DEFAULT_STATE.content.checkout)},
  reception_phone = ${sqlStr(DEFAULT_STATE.content.receptionPhone)},
  welcome = ${sqlJson(DEFAULT_STATE.content.welcome)},
  rules = ${sqlJson(DEFAULT_STATE.content.rules)},
  local_tips = ${sqlJson(DEFAULT_STATE.content.localTips)},
  spa_slots = ${sqlJson(DEFAULT_STATE.spaSlots)}
where id = 1;`);

DEFAULT_ROOMS.forEach((r, i) => {
  lines.push(`insert into rooms (number, sort_order) values (${sqlStr(r)}, ${i});`);
});

DEFAULT_STATE.menuCategories.forEach((c, i) => {
  lines.push(`insert into menu_categories (id, label, sort_order) values (${sqlStr(c.id)}, ${sqlJson(c.label)}, ${i});`);
});

DEFAULT_STATE.menu.forEach((m, i) => {
  lines.push(
    `insert into menu_items (category, price, name, description, sort_order) values (${sqlStr(m.category)}, ${m.price}, ${sqlJson(m.name)}, ${sqlJson(m.desc)}, ${i});`
  );
});

DEFAULT_STATE.housekeepingOptions.forEach((h, i) => {
  lines.push(`insert into housekeeping_options (icon, name, sort_order) values (${sqlStr(h.icon)}, ${sqlJson(h.name)}, ${i});`);
});

DEFAULT_STATE.spaServices.forEach((s, i) => {
  lines.push(`insert into spa_services (name, duration, price, sort_order) values (${sqlJson(s.name)}, ${s.duration}, ${s.price}, ${i});`);
});

DEFAULT_STATE.taxiOptions.forEach((t, i) => {
  lines.push(`insert into taxi_options (name, sort_order) values (${sqlJson(t.name)}, ${i});`);
});

DEFAULT_STATE.excursions.forEach((e, i) => {
  lines.push(`insert into excursions (price, name, description, sort_order) values (${e.price}, ${sqlJson(e.name)}, ${sqlJson(e.desc)}, ${i});`);
});

writeFileSync("seed.sql", lines.join("\n\n") + "\n");
console.log("wrote seed.sql,", lines.length, "statements");
