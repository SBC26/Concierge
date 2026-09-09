const { createCanvas, loadImage } = require(require("path").join(__dirname, "..", "node_modules", "canvas"));
const fs = require("fs");
const path = require("path");

async function main() {
  const img = await loadImage(path.join(__dirname, "schrift-raw.png"));
  const w = img.width, h = img.height;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  const rowHasContent = new Array(h).fill(false);
  let minX = w, maxX = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 10) {
        rowHasContent[y] = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  // find contiguous vertical bands separated by fully-empty rows (gap >= 4px)
  const bands = [];
  let start = null, gap = 0;
  for (let y = 0; y < h; y++) {
    if (rowHasContent[y]) {
      if (start === null) start = y;
      gap = 0;
    } else if (start !== null) {
      gap++;
      if (gap > 4) {
        bands.push([start, y - gap]);
        start = null;
        gap = 0;
      }
    }
  }
  if (start !== null) bands.push([start, h - 1]);
  console.log("bands (y ranges)", bands, "x range", [minX, maxX]);

  const outDir = path.join(__dirname, "..", "assets");
  fs.mkdirSync(outDir, { recursive: true });

  function exportCrop(name, y0, y1, targetH) {
    const pad = 8;
    const cx0 = minX - pad, cy0 = y0 - pad, cw = maxX - minX + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2;
    const th = targetH, tw = Math.round((cw / ch) * th);
    const out = createCanvas(tw, th);
    out.getContext("2d").drawImage(canvas, cx0, cy0, cw, ch, 0, 0, tw, th);
    fs.writeFileSync(path.join(outDir, name), out.toBuffer("image/png"));
    console.log("wrote", name, tw + "x" + th);
  }

  // Full lockup: mountain + wordmark + subtitle (all bands together)
  exportCrop("logo-wordmark-full.png", bands[0][0], bands[bands.length - 1][1], 500);

  // Text-only band: whichever band is tallest is the "SWISS BAAN CHIANG" text row
  let textBand = bands[0];
  for (const b of bands) if (b[1] - b[0] > textBand[1] - textBand[0]) textBand = b;
  exportCrop("logo-wordmark-text.png", textBand[0], textBand[1], 160);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
