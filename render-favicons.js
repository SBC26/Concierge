// Regenerates favicon-32.png / favicon-180.png from the master logo mark
// (assets/logo-kelch.png — the real brand vase artwork, already tight-cropped
// with a transparent background) onto the brand navy background. Re-run this
// whenever assets/logo-kelch.png changes.
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const NAVY = "#172f3c";

(async () => {
  const img = await loadImage(path.join(__dirname, "assets", "logo-kelch.png"));
  for (const size of [32, 180]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, 0, size, size);
    const scale = (size * 0.72) / Math.max(img.width, img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    fs.writeFileSync(path.join(__dirname, `favicon-${size}.png`), canvas.toBuffer("image/png"));
    console.log("wrote favicon-" + size + ".png");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
