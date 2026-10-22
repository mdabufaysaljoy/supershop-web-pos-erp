import { describe, expect, it } from 'vitest';
import { qrMatrix, QR_LEVELS, zatcaQr } from '../index.js';

/**
 * A QR nobody can read looks exactly like one that works, so this suite DECODES what we emit
 * instead of trusting its shape. The decoder is deliberately independent of the encoder: it finds
 * the format information, reads the level and mask the code declares, unmasks it, walks the
 * zigzag, de-interleaves the blocks and parses the byte-mode payload back out.
 *
 * It needs no error correction because our own dots are exact — which is the point: if a code
 * cannot be read from a perfect bitmap, it will never be read off paper.
 */

/** The 32 published format strings: index = (level bits << 3) | mask. */
const FORMAT_INFO = [
  0x5412,
  0x5125,
  0x5e7c,
  0x5b4b,
  0x45f9,
  0x40ce,
  0x4f97,
  0x4aa0, // M (00)
  0x77c4,
  0x72f3,
  0x7daa,
  0x789d,
  0x662f,
  0x6318,
  0x6c41,
  0x6976, // L (01)
  0x1689,
  0x13be,
  0x1ce7,
  0x19d0,
  0x0762,
  0x0255,
  0x0d0c,
  0x083b, // H (10)
  0x355f,
  0x3068,
  0x3f31,
  0x3a06,
  0x24b4,
  0x2183,
  0x2eda,
  0x2bed, // Q (11)
];
const LEVEL_OF_BITS = { 0b00: 'M', 0b01: 'L', 0b10: 'H', 0b11: 'Q' };

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** [ecCodewordsPerBlock, blocks] per version per level, and the version's total codewords. */
const TOTAL = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991,
  1085,
];
const BLOCKS = {
  L: [0, [7, 1], [10, 1], [15, 1], [20, 1], [26, 1], [18, 2], [20, 2], [24, 2], [30, 2], [18, 4]],
  M: [0, [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5]],
  Q: [0, [13, 1], [22, 1], [18, 2], [26, 2], [18, 4], [24, 4], [18, 6], [22, 6], [20, 8], [24, 8]],
  H: [0, [17, 1], [28, 1], [22, 2], [16, 4], [22, 4], [28, 4], [26, 5], [26, 6], [24, 8], [28, 8]],
};

const ALIGN = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Everything that is not data: finders, timing, alignment, format/version areas, dark module. */
function functionModules(size, version) {
  const taken = Array.from({ length: size }, () => new Array(size).fill(false));
  const block = (r0, c0, h, w) => {
    for (let r = r0; r < r0 + h; r += 1)
      for (let c = c0; c < c0 + w; c += 1)
        if (r >= 0 && r < size && c >= 0 && c < size) taken[r][c] = true;
  };
  block(0, 0, 9, 9);
  block(0, size - 8, 9, 8);
  block(size - 8, 0, 8, 9);
  for (let i = 0; i < size; i += 1) {
    taken[6][i] = true;
    taken[i][6] = true;
  }
  for (const r of ALIGN[version])
    for (const c of ALIGN[version]) {
      const nearFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (!nearFinder) block(r - 2, c - 2, 5, 5);
    }
  if (version >= 7) {
    block(size - 11, 0, 3, 6);
    block(0, size - 11, 6, 3);
  }
  return taken;
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
}
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

/** Syndromes all zero ⇒ the block carries no errors, which is what a clean bitmap must give. */
function syndromesZero(block, ecLen) {
  for (let i = 0; i < ecLen; i += 1) {
    let sum = 0;
    for (const byte of block) sum = gfMul(sum, GF_EXP[i]) ^ byte;
    if (sum !== 0) return false;
  }
  return true;
}

function decodeQr(matrix) {
  const size = matrix.length;
  expect((size - 17) % 4).toBe(0);
  const version = (size - 17) / 4;
  const dark = (r, c) => (matrix[r][c] ? 1 : 0);

  // Format information: bits 0-7 sit left of the top-right finder, bits 8-14 under the top-left.
  let format = 0;
  for (let i = 0; i < 8; i += 1) format |= dark(8, size - 1 - i) << i;
  for (let i = 8; i < 15; i += 1) format |= dark(size - 15 + i, 8) << i;
  const index = FORMAT_INFO.indexOf(format);
  expect(
    index,
    `format information ${format.toString(16)} is not a valid QR format string`,
  ).toBeGreaterThanOrEqual(0);
  const level = LEVEL_OF_BITS[index >> 3];
  const maskFn = MASKS[index & 7];

  // Unmask and read the codewords up the zigzag.
  const taken = functionModules(size, version);
  const bits = [];
  let col = size - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col -= 1; // the vertical timing pattern is not a column of data
    for (let i = 0; i < size; i += 1) {
      const r = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (c < 0 || taken[r][c]) continue;
        bits.push(dark(r, c) ^ (maskFn(r, c) ? 1 : 0));
      }
    }
    upward = !upward;
    col -= 2;
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b];
    codewords.push(byte);
  }

  // De-interleave into blocks, check each one is error-free, and keep the data halves.
  const [ecPerBlock, numBlocks] = BLOCKS[level][version];
  const total = TOTAL[version];
  const dataTotal = total - ecPerBlock * numBlocks;
  const shortLen = Math.floor(dataTotal / numBlocks);
  const longBlocks = dataTotal % numBlocks;
  const dataBlocks = Array.from(
    { length: numBlocks },
    (_, b) => new Array(shortLen + (b >= numBlocks - longBlocks ? 1 : 0)),
  );
  let at = 0;
  for (let i = 0; i <= shortLen; i += 1)
    for (let b = 0; b < numBlocks; b += 1)
      if (i < dataBlocks[b].length) dataBlocks[b][i] = codewords[at++];
  const ecBlocks = Array.from({ length: numBlocks }, () => new Array(ecPerBlock));
  for (let i = 0; i < ecPerBlock; i += 1)
    for (let b = 0; b < numBlocks; b += 1) ecBlocks[b][i] = codewords[at++];
  for (let b = 0; b < numBlocks; b += 1)
    expect(
      syndromesZero([...dataBlocks[b], ...ecBlocks[b]], ecPerBlock),
      `block ${b} has errors`,
    ).toBe(true);

  // Byte mode: 4 bits mode, then the length, then the bytes.
  const data = dataBlocks.flat();
  const stream = [];
  for (const byte of data) for (let b = 7; b >= 0; b -= 1) stream.push((byte >> b) & 1);
  const take = (n) => stream.splice(0, n).reduce((acc, bit) => (acc << 1) | bit, 0);
  expect(take(4)).toBe(0b0100); // byte mode
  const length = take(version <= 9 ? 8 : 16);
  const bytes = Array.from({ length }, () => take(8));
  return { level, text: new TextDecoder().decode(Uint8Array.from(bytes)) };
}

const PAYLOADS = {
  'an e-receipt link': 'http://192.168.0.169:3000/receipt/POS-000045',
  'a short code': 'HELLO',
  'a ZATCA tax invoice': zatcaQr({
    sellerName: 'Wafa Supershop',
    vatNumber: '300000000000003',
    timestamp: '2026-10-22T12:00:00.000Z',
    total: 11_500,
    vat: 1500,
  }),
  'Arabic text': 'مرحبا بكم في وفا سوبرشوب',
};

describe('the QR codes we print and show', () => {
  for (const [what, value] of Object.entries(PAYLOADS)) {
    it(`reads back ${what}, exactly as it went in`, () => {
      const decoded = decodeQr(qrMatrix(value));
      expect(decoded.text).toBe(value);
      // The strongest level, as a receipt needs: ~30% of the code can be lost and still read.
      expect(decoded.level).toBe('H');
    });
  }

  it('reads back at every level the shop can choose', () => {
    for (const level of QR_LEVELS) {
      const decoded = decodeQr(qrMatrix('http://shop.test/receipt/POS-1', { level }));
      expect(decoded).toEqual({ level, text: 'http://shop.test/receipt/POS-1' });
    }
  });
});
