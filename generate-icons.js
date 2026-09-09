const fs = require("fs");
const path = require("path");

const NEEDED = [
  "concierge-bell", "utensils-crossed", "utensils", "brush-cleaning", "flower-2", "car-taxi-front",
  "clipboard-list", "mail", "door-open", "landmark", "mountain", "shopping-bag", "bed", "droplets",
  "moon", "shirt", "sparkles", "scroll-text", "wifi", "clock", "sunrise", "log-in", "log-out",
  "phone-call", "check", "x", "chevron-down", "arrow-left", "arrow-right", "plus", "minus", "map-pin", "users", "send",
  "key-round", "trash-2", "bell", "bell-ring", "volume-2", "volume-x", "languages",
];

const iconsDir = path.join(__dirname, "node_modules", "lucide-static", "icons");
const entries = {};

for (const name of NEEDED) {
  const file = path.join(iconsDir, name + ".svg");
  const raw = fs.readFileSync(file, "utf8");
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
  const key = name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  entries[key] = inner;
}

const jsLines = Object.entries(entries).map(([key, inner]) => `  ${key}: \`${inner}\`,`);

const output = `// Auto-generated from lucide-static (ISC license) by generate-icons.js — do not hand-edit.
// Inner SVG markup only; ICONS.<name>() wraps it with the brand's stroke weight & sizing.
const ICON_PATHS = {
${jsLines.join("\n")}
};

export function icon(name, { size = 22, strokeWidth = 1.25, className = "" } = {}) {
  const inner = ICON_PATHS[name];
  if (!inner) return "";
  return \`<svg class="icon \${className}" width="\${size}" height="\${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="\${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${inner}</svg>\`;
}
`;

fs.writeFileSync(path.join(__dirname, "js", "icons.js"), output);
console.log("wrote js/icons.js with", Object.keys(entries).length, "icons");
