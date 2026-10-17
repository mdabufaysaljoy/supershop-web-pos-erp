import { toBase64 } from './escpos.js';

/**
 * ZATCA Phase-1 Simplified Tax Invoice QR (CLAUDE.md §5.6, P6.4) + framework-free SVG QR renderer.
 *
 * ZATCA specifies a Base64-encoded TLV (Tag-Length-Value) payload with five UTF-8 fields:
 *   1 = Seller's name
 *   2 = VAT registration number (15 digits)
 *   3 = Invoice timestamp (ISO 8601)
 *   4 = Invoice total (with VAT) in SAR ("0.00")
 *   5 = VAT amount in SAR ("0.00")
 */
const utf8 = new TextEncoder();
const utf8Decode = new TextDecoder('utf-8');

/** Minor units (halalas) → "115.00" (always ASCII digits and 2 decimal places, as ZATCA requires). */
export function formatZatcaAmount(minor) {
  const n = Number.isFinite(minor) ? Math.trunc(minor) : 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function normalizeTimestamp(value) {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).trim() : parsed.toISOString();
}

/**
 * Builds the ZATCA Phase-1 TLV Base64 string. Returns `''` when the shop has no VAT number or
 * seller name yet, so receipts and invoices omit the QR cleanly instead of printing an invalid one.
 *
 * @param {{ sellerName?: string, vatNumber?: string | null, timestamp?: Date | string, total?: number, vat?: number }} input
 * @returns {string}
 */
export function zatcaQr({ sellerName, vatNumber, timestamp, total = 0, vat = 0 } = {}) {
  const seller = String(sellerName ?? '').trim();
  const vatNo = String(vatNumber ?? '').trim();
  const time = normalizeTimestamp(timestamp);
  if (!seller || !vatNo || !time) return '';

  const fields = [
    [1, seller],
    [2, vatNo],
    [3, time],
    [4, formatZatcaAmount(total)],
    [5, formatZatcaAmount(vat)],
  ];
  const bytes = [];
  for (const [tag, val] of fields) {
    const encoded = utf8.encode(val).slice(0, 255);
    bytes.push(tag, encoded.length, ...encoded);
  }
  return toBase64(Uint8Array.from(bytes));
}

/**
 * Decodes a ZATCA Phase-1 TLV Base64 payload back into its 5 fields (for tests and inspection).
 * Returns `null` if the payload is not a valid 5-tag TLV sequence.
 *
 * @param {string} base64
 * @returns {null | { sellerName: string, vatNumber: string, timestamp: string, total: string, vat: string }}
 */
export function decodeZatcaQr(base64) {
  if (typeof base64 !== 'string' || !base64.trim()) return null;
  let bytes;
  try {
    if (typeof atob === 'function') {
      const bin = atob(base64);
      bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } else {
      bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
    }
  } catch {
    return null;
  }
  const tags = {};
  let i = 0;
  while (i < bytes.length) {
    if (i + 2 > bytes.length) return null;
    const tag = bytes[i];
    const len = bytes[i + 1];
    if (tag < 1 || tag > 5 || i + 2 + len > bytes.length) return null;
    tags[tag] = utf8Decode.decode(bytes.subarray(i + 2, i + 2 + len));
    i += 2 + len;
  }
  if (!tags[1] || !tags[2] || !tags[3] || tags[4] === undefined || tags[5] === undefined) {
    return null;
  }
  return {
    sellerName: tags[1],
    vatNumber: tags[2],
    timestamp: tags[3],
    total: tags[4],
    vat: tags[5],
  };
}

// ---------------------------------------------------------------- QR Code (Model 2, ECC Level L)

/**
 * Version 1..10 parameters at Error Correction Level L:
 * [totalCodewords, ecCodewordsPerBlock, numBlocks, alignmentCenters]
 */
const QR_VERSIONS_L = [
  null,
  [26, 7, 1, []],
  [44, 10, 1, [6, 18]],
  [70, 15, 1, [6, 22]],
  [100, 20, 1, [6, 26]],
  [134, 26, 1, [6, 30]],
  [172, 18, 2, [6, 34]],
  [196, 20, 2, [6, 22, 38]],
  [242, 24, 2, [6, 24, 42]],
  [292, 30, 2, [6, 26, 46]],
  [346, 18, 4, [6, 28, 50]],
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly.slice(1);
}

function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const rem = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < degree; j += 1) rem[j] ^= gfMul(gen[j], factor);
    }
  }
  return rem;
}

/**
 * Encodes a string into a square boolean matrix (true = dark module) as a Model 2 QR Code (Level L).
 * @param {string} value
 * @returns {boolean[][]}
 */
export function qrMatrix(value) {
  const payload = utf8.encode(String(value ?? ''));
  let version = 1;
  while (version <= 10) {
    const [total, ecPerBlock, blocks] = QR_VERSIONS_L[version];
    const dataCap = total - ecPerBlock * blocks;
    const headerBytes = version <= 9 ? 2 : 3;
    if (payload.length + headerBytes <= dataCap) break;
    version += 1;
  }
  if (version > 10) throw new RangeError('QR payload exceeds version 10 capacity');

  const [totalCodewords, ecPerBlock, numBlocks, align] = QR_VERSIONS_L[version];
  const dataCodewords = totalCodewords - ecPerBlock * numBlocks;

  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // byte mode
  pushBits(payload.length, version <= 9 ? 8 : 16);
  for (const b of payload) pushBits(b, 8);
  pushBits(0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length / 8; i += 1) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i * 8 + b];
    codewords[i] = byte;
  }
  for (let i = bits.length / 8, pad = 0; i < dataCodewords; i += 1, pad ^= 1) {
    codewords[i] = pad ? 0x11 : 0xec;
  }

  // Split into blocks & compute Reed-Solomon EC codewords
  const shortBlocks = numBlocks - (dataCodewords % numBlocks);
  const shortLen = Math.floor(dataCodewords / numBlocks);
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let b = 0; b < numBlocks; b += 1) {
    const len = shortLen + (b < shortBlocks ? 0 : 1);
    const slice = codewords.subarray(offset, offset + len);
    offset += len;
    dataBlocks.push(slice);
    ecBlocks.push(rsRemainder(slice, ecPerBlock));
  }

  const interleaved = [];
  const maxDataLen = shortLen + (shortBlocks < numBlocks ? 1 : 0);
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i]);
  }

  const size = 17 + version * 4;
  const grid = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setModule = (r, c, dark) => {
    grid[r][c] = Boolean(dark);
    reserved[r][c] = true;
  };

  const placeFinder = (row, col) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setModule(r, c, inOuter && (onBorder || inCore));
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (const r of align) {
    for (const c of align) {
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setModule(r + dr, c + dc, dark);
        }
      }
    }
  }

  for (let i = 8; i < size - 8; i += 1) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Reserve format info areas + dark module
  for (let i = 0; i < 9; i += 1) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  setModule(size - 8, 8, true);

  // Place data bits with mask 0: (r + c) % 2 === 0
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((size - 1 - right) / 2) % 2 === 0;
    for (let step = 0; step < size; step += 1) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc += 1) {
        const c = right - dc;
        if (reserved[r][c]) continue;
        const bit = bitIdx < totalBits ? (interleaved[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
        bitIdx += 1;
        grid[r][c] = Boolean(bit ^ ((r + c) % 2 === 0 ? 1 : 0));
      }
    }
  }

  // Format information for ECC Level L (01) + Mask 0 (000) => 0x77c4
  const FORMAT_L_MASK0 = 0x77c4;
  const formatCoordsA = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];
  const formatCoordsB = [
    [size - 1, 8],
    [size - 2, 8],
    [size - 3, 8],
    [size - 4, 8],
    [size - 5, 8],
    [size - 6, 8],
    [size - 7, 8],
    [8, size - 8],
    [8, size - 7],
    [8, size - 6],
    [8, size - 5],
    [8, size - 4],
    [8, size - 3],
    [8, size - 2],
    [8, size - 1],
  ];
  for (let i = 0; i < 15; i += 1) {
    const bit = Boolean((FORMAT_L_MASK0 >> i) & 1);
    const [r1, c1] = formatCoordsA[i];
    const [r2, c2] = formatCoordsB[i];
    grid[r1][c1] = bit;
    grid[r2][c2] = bit;
  }

  return grid;
}

/**
 * Renders a QR code as a standalone SVG string (for printable invoices and receipt previews).
 * Returns `''` when `value` is empty.
 *
 * @param {string} value
 * @param {{ size?: number, margin?: number }} [opts]
 * @returns {string}
 */
export function qrSvg(value, { size = 120, margin = 2 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const matrix = qrMatrix(text);
  const dim = matrix.length + margin * 2;
  let path = '';
  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c < matrix.length; c += 1) {
      if (matrix[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
