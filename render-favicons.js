const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

(async () => {
  const svgBuf = fs.readFileSync(path.join(__dirname, "favicon.svg"));
  const sizes = [32, 180]; // 32 = <link rel="icon">, 180 = apple-touch-icon; the SVG covers everything else
  for (const size of sizes) {
    const img = await loadImage(svgBuf);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, size, size);
    const out = fs.createWriteStream(path.join(__dirname, `favicon-${size}.png`));
    canvas.createPNGStream().pipe(out);
    await new Promise((resolve, reject) => {
      out.on("finish", resolve);
      out.on("error", reject);
    });
    console.log("wrote favicon-" + size + ".png");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
