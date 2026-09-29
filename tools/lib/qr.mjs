// qr.mjs: minimal QR Code encoder (byte mode, versions 1-10) that renders a static SVG.
// Structure follows Project Nayuki's QR Code generator library:
//
//   Copyright (c) Project Nayuki. (MIT License)
//   https://www.nayuki.io/page/qr-code-generator-library
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of
//   this software and associated documentation files (the "Software"), to deal in
//   the Software without restriction, including without limitation the rights to
//   use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
//   the Software, and to permit persons to whom the Software is furnished to do so,
//   subject to the following conditions:
//   - The above copyright notice and this permission notice shall be included in
//     all copies or substantial portions of the Software.
//   - The Software is provided "as is", without warranty of any kind, express or
//     implied, including but not limited to the warranties of merchantability,
//     fitness for a particular purpose and noninfringement. In no event shall the
//     authors or copyright holders be liable for any claim, damages or other
//     liability, whether in an action of contract, tort or otherwise, arising from,
//     out of or in connection with the Software or the use or other dealings in the
//     Software.

export const ECC = { L: { ordinal: 0, formatBits: 1 }, M: { ordinal: 1, formatBits: 0 }, Q: { ordinal: 2, formatBits: 3 }, H: { ordinal: 3, formatBits: 2 } };
export const MAX_VERSION = 10;

// ISO/IEC 18004 table 9, versions 1-10: EC codewords per block and number of blocks.
const ECC_PER_BLOCK = [
  [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];
const NUM_BLOCKS = [
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];

const bit = (x, i) => ((x >>> i) & 1) !== 0;

export function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

export function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export function blockLayout(version, ecl) {
  const eccLen = ECC_PER_BLOCK[ECC[ecl].ordinal][version - 1];
  const blocks = NUM_BLOCKS[ECC[ecl].ordinal][version - 1];
  const total = Math.floor(rawDataModules(version) / 8);
  return { eccLen, blocks, total, dataCodewords: total - eccLen * blocks };
}

// --- GF(256) Reed-Solomon, primitive polynomial 0x11D ---

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

export function reedSolomon(data, degree) {
  const divisor = rsDivisor(degree);
  const result = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMul(coef, factor); });
  }
  return result;
}

// --- Data codewords ---

function dataCodewords(bytes, version, ecl) {
  const { dataCodewords: capacity } = blockLayout(version, ecl);
  const bits = [];
  const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacityBits = capacity * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function interleave(data, version, ecl) {
  const { eccLen, blocks, total } = blockLayout(version, ecl);
  const shortLen = Math.floor(total / blocks);
  const shortBlocks = blocks - (total % blocks);
  const parts = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const len = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const block = data.slice(k, k + len);
    k += len;
    parts.push({ data: block, ecc: reedSolomon(block, eccLen) });
  }
  const out = [];
  const maxData = Math.max(...parts.map((p) => p.data.length));
  for (let i = 0; i < maxData; i++) for (const p of parts) if (i < p.data.length) out.push(p.data[i]);
  for (let i = 0; i < eccLen; i++) for (const p of parts) out.push(p.ecc[i]);
  return out;
}

// --- Matrix ---

export const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export function formatBits(ecl, mask) {
  const data = (ECC[ecl].formatBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function createGrid(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx; const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const align = alignmentPositions(version);
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3); const b = Math.floor(i / 3);
      set(a, b, bit(bits, i)); set(b, a, bit(bits, i));
    }
  }
  return { size, modules, isFunction, set };
}

function drawFormat(grid, ecl, mask) {
  const { size, set } = grid;
  const bits = formatBits(ecl, mask);
  for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
  set(8, 7, bit(bits, 6));
  set(8, 8, bit(bits, 7));
  set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
  set(8, size - 8, true);
}

function drawCodewords({ size, modules, isFunction }, codewords) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < codewords.length * 8) {
          modules[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

function applyMask({ size, modules, isFunction }, mask) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (!isFunction[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  }
}

const FINDER_LIKE = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];

function penalty(modules) {
  const size = modules.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i++) {
    lines.push(modules[i]);
    lines.push(modules.map((row) => row[i]));
  }
  for (const line of lines) {
    let run = 1;
    for (let k = 1; k <= size; k++) {
      if (k < size && line[k] === line[k - 1]) { run++; continue; }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
    for (let k = 0; k + 11 <= size; k++) {
      if (FINDER_LIKE.some((p) => p.every((v, o) => (line[k + o] ? 1 : 0) === v))) score += 40;
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }
  const dark = modules.flat().filter(Boolean).length;
  const total = size * size;
  score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

// Smallest version that fits at `ecl`; the mask with the lowest penalty wins (ties: lowest mask).
export function encodeText(text, { ecl = 'M', mask } = {}) {
  if (!ECC[ecl]) throw new Error(`qr: unknown error correction level "${ecl}"`);
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let version = 1;
  while (version <= MAX_VERSION && blockLayout(version, ecl).dataCodewords * 8 < 4 + (version <= 9 ? 8 : 16) + bytes.length * 8) version++;
  if (version > MAX_VERSION) throw new Error(`qr: ${bytes.length} bytes do not fit version ${MAX_VERSION}-${ecl}`);

  const codewords = interleave(dataCodewords(bytes, version, ecl), version, ecl);
  const render = (m) => {
    const grid = createGrid(version);
    drawFormat(grid, ecl, 0);
    drawCodewords(grid, codewords);
    applyMask(grid, m);
    drawFormat(grid, ecl, m);
    return grid;
  };
  let best;
  for (const m of mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask]) {
    const grid = render(m);
    const score = penalty(grid.modules);
    if (!best || score < best.score) best = { grid, score, mask: m };
  }
  return { version, ecl, mask: best.mask, size: best.grid.size, modules: best.grid.modules };
}

// Dark modules as one path of horizontal runs; the light background comes from the page.
export function toSvg({ modules, size }, { quietZone = 4, color = '#0c0f12' } = {}) {
  const dim = size + quietZone * 2;
  const parts = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules[y][x]) continue;
      let run = 1;
      while (x + run < size && modules[y][x + run]) run++;
      parts.push(`M${x + quietZone} ${y + quietZone}h${run}v1h-${run}z`);
      x += run - 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`
    + `<path fill="${color}" d="${parts.join('')}"/></svg>\n`;
}
