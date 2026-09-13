/**
 * Minimal QR encoder — byte mode, error-correction level M, versions 1-6
 * (up to 108 bytes, far more than a LAN URL needs). Exists so the demo can put
 * a scannable code on the laptop screen without a dependency or a CDN.
 */

// --------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    // Multiply by (x + a^i), coefficients held in descending degree order.
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const out = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.shift();
    out.push(0);
    for (let i = 0; i < ecLen; i++) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

// ------------------------------------------------------- version tables (M)

// [total codewords, ec codewords per block, [ [blocks, data codewords], ... ] ]
const VERSIONS = {
  1: [26, 10, [[1, 16]]],
  2: [44, 16, [[1, 28]]],
  3: [70, 26, [[1, 44]]],
  4: [100, 18, [[2, 32]]],
  5: [134, 24, [[2, 43]]],
  6: [172, 16, [[4, 27]]]
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
const capacity = (v) => VERSIONS[v][2].reduce((sum, [n, d]) => sum + n * d, 0);

// ------------------------------------------------------------------ encode

function bitStream(text, version) {
  const bytes = [...new TextEncoder().encode(text)];
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1); };

  push(0b0100, 4);        // byte mode
  push(bytes.length, 8);  // character count, 8 bits for versions 1-9
  for (const b of bytes) push(b, 8);

  const total = capacity(version) * 8;
  for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0);   // terminator
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((a, bit) => (a << 1) | bit, 0));
  }
  // Pad bytes alternate starting at 0xec, regardless of how many codewords the
  // message itself produced.
  const PAD = [0xec, 0x11];
  for (let i = 0; codewords.length < capacity(version); i++) codewords.push(PAD[i % 2]);
  return codewords;
}

/** Split into blocks, add Reed-Solomon, then interleave as the spec requires. */
function interleave(codewords, version) {
  const [, ecLen, groups] = VERSIONS[version];
  const blocks = [];
  let offset = 0;
  for (const [count, dataLen] of groups) {
    for (let i = 0; i < count; i++) {
      const data = codewords.slice(offset, offset + dataLen);
      offset += dataLen;
      blocks.push({ data, ec: rsEncode(data, ecLen) });
    }
  }
  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ------------------------------------------------------------------ matrix

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function buildBase(version) {
  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Array(size).fill(null));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, v) => { grid[r][c] = v; fixed[r][c] = true; };

  const finder = (top, left) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(rr, cc, inRing ? 1 : 0);
      }
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }

  for (const r of ALIGN[version]) {
    for (const c of ALIGN[version]) {
      if (grid[r][c] !== null) continue; // skip where finders already sit
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
        }
      }
    }
  }

  set(size - 8, 8, 1); // the dark module
  // Reserve the format-information areas so data placement skips them.
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) set(8, i, 0);
    if (grid[i][8] === null) set(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (grid[8][size - 1 - i] === null) set(8, size - 1 - i, 0);
    if (grid[size - 1 - i][8] === null) set(size - 1 - i, 8, 0);
  }
  return { grid, fixed, size };
}

function placeData(grid, fixed, size, bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  let index = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1; // the vertical timing column is never data
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (fixed[row][col]) continue;
        grid[row][col] = index < bits.length ? bits[index] : 0;
        index += 1;
      }
    }
    upward = !upward;
  }
}

function penalty(grid, size) {
  let score = 0;
  const runScore = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) total += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };
  const PATTERN_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const PATTERN_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matches = (line, at, pattern) => pattern.every((v, i) => line[at + i] === v);

  for (let i = 0; i < size; i++) {
    const row = grid[i];
    const col = grid.map((r) => r[i]);
    score += runScore(row) + runScore(col);
    for (const line of [row, col]) {
      for (let j = 0; j + 11 <= size; j++) {
        if (matches(line, j, PATTERN_A) || matches(line, j, PATTERN_B)) score += 40;
      }
    }
  }
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }
  const dark = grid.flat().filter((v) => v === 1).length;
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

function writeFormat(grid, size, mask) {
  // ECC level M is 0b00; 5 data bits + 10 BCH bits, XORed with 0x5412.
  let bits = (0b00 << 3) | mask;
  let rem = bits;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const format = (((bits << 10) | rem) ^ 0x5412) & 0x7fff;
  const bit = (i) => (format >> i) & 1;

  // First copy: down the left of the top-right finder, then along row 8.
  for (let i = 0; i <= 5; i++) grid[i][8] = bit(i);
  grid[7][8] = bit(6);
  grid[8][8] = bit(7);
  grid[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) grid[8][14 - i] = bit(i);

  // Second copy: along row 8 on the right, then down column 8 at the bottom.
  for (let i = 0; i <= 7; i++) grid[8][size - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i++) grid[size - 15 + i][8] = bit(i);
  grid[size - 8][8] = 1; // dark module stays dark
}

/** Returns a size x size matrix of 0/1. `forceMask` exists for testing. */
export function encode(text, forceMask = null) {
  const version = Object.keys(VERSIONS).map(Number).find((v) => capacity(v) >= new TextEncoder().encode(text).length + 2);
  if (!version) throw new Error('qr: text too long for versions 1-6');

  const bytes = interleave(bitStream(text, version), version);
  let best = null;
  for (let mask = forceMask === null ? 0 : forceMask; mask < (forceMask === null ? 8 : forceMask + 1); mask++) {
    const { grid, fixed, size } = buildBase(version);
    placeData(grid, fixed, size, bytes);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (!fixed[r][c] && MASKS[mask](r, c)) grid[r][c] ^= 1;
    }
    writeFormat(grid, size, mask);
    const score = penalty(grid, size);
    if (!best || score < best.score) best = { score, grid, size };
  }
  return best.grid;
}

/** Internals, exported only so the round-trip test can verify each stage. */
export const __test = { bitStream, interleave, buildBase, MASKS, VERSIONS, capacity, rsEncode, rsGenerator };

/** Renders the matrix as a standalone SVG string, quiet zone included. */
export function svg(text, { scale = 8, quiet = 4, dark = '#15120f', light = '#f4ece1' } = {}) {
  const grid = encode(text);
  const size = grid.length;
  const dim = (size + quiet * 2) * scale;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) path += `M${(c + quiet) * scale} ${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
