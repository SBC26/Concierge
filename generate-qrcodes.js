// Generates one QR-code PNG per room, encoding a link that pre-fills that
// room on a guest's own phone (index.html?room=<number>) — see
// js/store.js applyRoomFromUrl(). Re-run whenever the room list or the
// live site URL changes. Room list here should match the `rooms` table.
import QRCode from "qrcode";
import { mkdirSync } from "fs";
import { DEFAULT_ROOMS } from "./js/data.js";

const BASE_URL = "https://concierge.swissbaanchiang.com/index.html";
const OUT_DIR = "./qr";

mkdirSync(OUT_DIR, { recursive: true });

for (const room of DEFAULT_ROOMS) {
  const url = `${BASE_URL}?room=${encodeURIComponent(room)}`;
  const file = `${OUT_DIR}/zimmer-${room}.png`;
  await QRCode.toFile(file, url, {
    width: 600,
    margin: 2,
    color: { dark: "#172f3c", light: "#faf6ef" },
  });
  console.log(`wrote ${file}  (${url})`);
}
