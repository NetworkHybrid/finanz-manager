/* Erzeugt ein 1024x1024-PNG als Quelle fuer `tauri icon` — ohne externe Pakete. */
const zlib = require("zlib");
const fs = require("fs");

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

const W = 1024, H = 1024;
const px = Buffer.alloc(W * H * 4);
const set = (x, y, r, g, b, a) => {
  const o = (y * W + x) * 4;
  px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
};

// Abgerundetes Quadrat als Hintergrund (dunkler Verlauf)
const radius = 224;
const inRounded = (x, y) => {
  const cx = Math.min(Math.max(x, radius), W - radius);
  const cy = Math.min(Math.max(y, radius), H - radius);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
};
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (inRounded(x, y)) {
      const t = y / H;
      set(x, y, Math.round(13 + t * 12), Math.round(20 + t * 18), Math.round(30 + t * 24), 255);
    } else {
      set(x, y, 0, 0, 0, 0);
    }
  }
}

// Aufsteigende Balken (Emerald) — Finanz-/Wachstumssymbol
const baseY = 752;
const barW = 156, gap = 44, startX = 246;
const heights = [232, 366, 510];
heights.forEach((h, i) => {
  const x0 = startX + i * (barW + gap);
  for (let y = baseY - h; y < baseY; y++) {
    for (let x = x0; x < x0 + barW; x++) {
      const t = (baseY - y) / 560;
      set(x, y, Math.round(13 + t * 30), Math.min(255, Math.round(150 + t * 70)), Math.round(120 + t * 30), 255);
    }
  }
});

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, y * W * 4 + W * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.writeFileSync("appicon.png", png);
console.log("appicon.png erstellt (" + png.length + " Bytes)");
