// Sample dominant colors from a PNG without native deps.
const fs = require("fs");
const zlib = require("zlib");

const p = process.argv[2];
const b = fs.readFileSync(p);

// Parse chunks
let off = 8;
let w = 0, h = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (off < b.length) {
  const len = b.readUInt32BE(off);
  const type = b.slice(off + 4, off + 8).toString("ascii");
  const data = b.slice(off + 8, off + 8 + len);
  if (type === "IHDR") {
    w = data.readUInt32BE(0);
    h = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === "IDAT") {
    idat.push(data);
  }
  off += 12 + len;
}
console.log(`size=${w}x${h} bitDepth=${bitDepth} colorType=${colorType}`);

const raw = zlib.inflateSync(Buffer.concat(idat));
// Only support colorType 6 (RGBA) and 2 (RGB) with bitDepth 8 for simplicity.
const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
if (!channels) {
  console.log("unsupported colorType", colorType);
  process.exit(0);
}
const stride = w * channels;
const rowBytes = stride + 1; // filter byte per row

// De-filter scanlines (types 0,1,2,3,4)
const out = Buffer.alloc(h * stride);
for (let y = 0; y < h; y++) {
  const f = raw[y * rowBytes];
  for (let x = 0; x < stride; x++) {
    const i = y * rowBytes + 1 + x;
    const left = x >= channels ? out[y * stride + x - channels] : 0;
    const up = y > 0 ? out[(y - 1) * stride + x] : 0;
    const ul = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
    let val = raw[i];
    let pred;
    switch (f) {
      case 0: pred = 0; break;
      case 1: pred = left; break;
      case 2: pred = up; break;
      case 3: pred = (left + up) >> 1; break;
      case 4: {
        const pA = left + up - ul;
        const pB = Math.abs(left - ul);
        const pC = Math.abs(up - ul);
        const pD = Math.abs(pA - ul);
        pred = pB <= pC && pB <= pD ? left : pC <= pD ? up : ul;
        break;
      }
      default: pred = 0;
    }
    out[y * stride + x] = (val + pred) & 0xff;
  }
}

// Sample color buckets — find the most saturated/non-gray color and top colors.
const buckets = new Map();
function add(c) {
  const key = `${c[0]},${c[1]},${c[2]}`;
  buckets.set(key, (buckets.get(key) || 0) + 1);
}
// sample every 3rd pixel
for (let i = 0; i < h * stride; i += channels * 3) {
  add([out[i], out[i + 1], out[i + 2]]);
}
const sorted = [...buckets.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12);
console.log("top colors (count -> rgb):");
for (const [k, v] of sorted) {
  const [r, g, bl] = k.split(",").map(Number);
  const hex = "#" + [r, g, bl].map((x) => x.toString(16).padStart(2, "0")).join("");
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
  const sat = max === 0 ? 0 : (max - min) / max;
  console.log(`  ${hex}  (${r},${g},${bl})  count=${v}  sat=${sat.toFixed(2)}`);
}

// Find most "colorful" (high saturation, mid lightness, warm hue) candidate
let best = null, bestScore = -1;
for (const [k, v] of sorted) {
  const [r, g, bl] = k.split(",").map(Number);
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
  if (max < 40) continue; // skip near-black
  const sat = max === 0 ? 0 : (max - min) / max;
  const lig = max / 255;
  if (sat < 0.25) continue; // skip gray/white
  // score: prefer saturated non-neon colors in red-magenta family
  const warm = r > bl;
  const score = sat * 2 + (warm ? 0.4 : 0) + Math.min(lig, 1 - lig) * 0.5 + Math.log(v + 1) * 0.3;
  if (score > bestScore) { bestScore = score; best = { k, r, g, bl, sat, lig }; }
}
if (best) {
  const hex = "#" + [best.r, best.g, best.bl].map((x) => x.toString(16).padStart(2, "0")).join("");
  console.log("\nBEST branded color:", hex, `(${best.r},${best.g},${best.bl})`, "sat=" + best.sat.toFixed(2), "light=" + best.lig.toFixed(2));
}
