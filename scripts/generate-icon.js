/* Generates build/icon.png (512×512) — zero dependencies (raw PNG encoder). */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;

/* --------------------------------- PNG ---------------------------------- */

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------- drawing -------------------------------- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Anti-aliased rounded-rect coverage (signed distance). */
function roundRectCoverage(x, y, inset, radius) {
  const x0 = inset;
  const y0 = inset;
  const x1 = SIZE - inset;
  const y1 = SIZE - inset;
  const qx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
  const qy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
  const outside = Math.hypot(qx, qy) - radius;
  return 1 - smooth(-1, 1, outside);
}

function main() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);

  const pulse = [
    [56, 268],
    [150, 268],
    [178, 268],
    [198, 232],
    [224, 322],
    [254, 148],
    [288, 268],
    [322, 268],
    [456, 268],
  ];

  const top = [92, 124, 255]; // #5c7cff
  const bottom = [10, 14, 36]; // #0a0e24
  const teal = [20, 214, 168];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const cov = roundRectCoverage(x + 0.5, y + 0.5, 10, 116);
      if (cov <= 0) continue;

      /* vertical gradient */
      const t = y / (SIZE - 1);
      let r = top[0] + (bottom[0] - top[0]) * t;
      let g = top[1] + (bottom[1] - top[1]) * t;
      let b = top[2] + (bottom[2] - top[2]) * t;

      /* teal glow, bottom-right */
      const gd = Math.hypot(x - 396, y - 430) / 330;
      const gi = Math.max(0, 1 - gd) ** 2 * 0.55;
      r += (teal[0] - r) * gi;
      g += (teal[1] - g) * gi;
      b += (teal[2] - b) * gi;

      /* soft inner rim light */
      const rim = (1 - smooth(10, 46, Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y))) * 0.12;
      r += (255 - r) * rim;
      g += (255 - g) * rim;
      b += (255 - b) * rim;

      /* pulse waveform */
      let d = Infinity;
      for (let s = 0; s < pulse.length - 1; s++) {
        const [ax, ay] = pulse[s];
        const [bx, by] = pulse[s + 1];
        d = Math.min(d, distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by));
      }

      const core = 1 - smooth(9, 12, d); // 22px wide stroke
      const halo = (1 - smooth(14, 40, d)) * 0.35;

      /* teal halo under the white line */
      r += (teal[0] - r) * halo;
      g += (teal[1] - g) * halo;
      b += (teal[2] - b) * halo;

      /* white core */
      r += (255 - r) * core;
      g += (255 - g) * core;
      b += (255 - b) * core;

      /* recording dot at the QRS peak */
      const dotD = Math.hypot(x - 254, y - 148);
      const dot = 1 - smooth(26, 29, dotD);
      if (dot > 0) {
        r += (teal[0] - r) * dot;
        g += (teal[1] - g) * dot;
        b += (teal[2] - b) * dot;
      }

      rgba[i] = Math.round(clamp(r, 0, 255));
      rgba[i + 1] = Math.round(clamp(g, 0, 255));
      rgba[i + 2] = Math.round(clamp(b, 0, 255));
      rgba[i + 3] = Math.round(cov * 255);
    }
  }

  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(rgba, SIZE));
  console.log(`✓ wrote ${out} (${SIZE}×${SIZE})`);
}

main();
