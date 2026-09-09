const { createCanvas, loadImage } = require(require("path").join(__dirname, "..", "node_modules", "canvas"));
const fs = require("fs");
const path = require("path");

async function main() {
  const img = await loadImage(path.join(__dirname, "kelch-raw.png"));
  const w = img.width, h = img.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log("bounds", { minX, minY, maxX, maxY, w, h });

  const pad = 20; // small transparent margin
  const cw = maxX - minX + 1 + pad * 2;
  const ch = maxY - minY + 1 + pad * 2;
  const cropped = createCanvas(cw, ch);
  const cctx = cropped.getContext("2d");
  cctx.drawImage(canvas, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);

  const outDir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(outDir, { recursive: true });

  // Master asset (transparent, used inline at small display sizes e.g. vaseLogo()) —
  // aspect-preserving fit into a 500-tall canvas.
  const masterH = 500;
  const masterW = Math.round((cw / ch) * masterH);
  const master = createCanvas(masterW, masterH);
  master.getContext("2d").drawImage(cropped, 0, 0, masterW, masterH);
  fs.writeFileSync(path.join(outDir, "logo-kelch.png"), master.toBuffer("image/png"));

  // Favicons — navy background fill (brand convention), vase centered with padding,
  // aspect preserved (no stretching).
  for (const size of [32, 180]) {
    const fav = createCanvas(size, size);
    const fctx = fav.getContext("2d");
    fctx.fillStyle = "#172f3c";
    fctx.fillRect(0, 0, size, size);
    const scale = (size * 0.72) / Math.max(cw, ch);
    const dw = cw * scale, dh = ch * scale;
    fctx.drawImage(cropped, (size - dw) / 2, (size - dh) / 2, dw, dh);
    fs.writeFileSync(path.join(__dirname, "..", `favicon-${size}.png`), fav.toBuffer("image/png"));
  }

  console.log("done", { masterSize: master.width + "x" + master.height, croppedSize: cw + "x" + ch });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
