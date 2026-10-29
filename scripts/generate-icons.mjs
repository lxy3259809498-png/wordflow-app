import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dependency-free PWA icon generator: draws the WordFlow mark (rounded square +
 * three flowing strokes) and writes real PNG files.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([length, typeBuf, data, crc]);
}

function png(width, height, pixelFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function roundedRectCoverage(x, y, size, padding, radius) {
  const min = padding;
  const max = size - padding;
  if (x < min || y < min || x > max || y > max) return 0;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return clamp01(radius + 0.5 - dist);
}

// Three sine-wave strokes, the "flow" of WordFlow.
function strokeCoverage(x, y, size) {
  const norm = size / 64;
  const strokes = [
    { y: 22, thickness: 1.7, alpha: 0.55 },
    { y: 32, thickness: 1.7, alpha: 0.8 },
    { y: 42, thickness: 1.7, alpha: 1 },
  ];
  let best = 0;
  for (const stroke of strokes) {
    const phaseX = (x / norm - 14) / 36;
    if (phaseX < 0 || phaseX > 1) continue;
    const wave = stroke.y + Math.sin(phaseX * Math.PI * 2) * 4;
    const dist = Math.abs(y / norm - wave);
    const coverage = clamp01(stroke.thickness + 0.6 - dist);
    if (coverage > 0) best = Math.max(best, coverage * stroke.alpha);
  }
  return best;
}

function makeIcon(size, paddingRatio) {
  const padding = Math.round(size * paddingRatio);
  const radius = Math.max(2, Math.round((size - padding * 2) * 0.24));
  return png(size, size, (x, y) => {
    const cover = roundedRectCoverage(x, y, size, padding, radius);
    if (cover <= 0) return [0, 0, 0, 0];
    const t = (x / size) * 0.5 + (y / size) * 0.5;
    const base = [mix(139, 90, t), mix(125, 72, t), mix(255, 240, t)];
    const stroke = strokeCoverage(x, y, size);
    const r = Math.round(mix(base[0], 255, stroke));
    const g = Math.round(mix(base[1], 255, stroke));
    const b = Math.round(mix(base[2], 255, stroke));
    return [r, g, b, Math.round(255 * cover)];
  });
}

const outputs = [
  ['icon-192.png', 192, 0.12],
  ['icon-512.png', 512, 0.12],
  ['icon-maskable-512.png', 512, 0.22],
  ['apple-touch-icon.png', 180, 0.14],
];

for (const [name, size, padding] of outputs) {
  writeFileSync(resolve(outDir, name), makeIcon(size, padding));
  console.log(`generated public/icons/${name} (${size}x${size})`);
}
