/**
 * Barcodes (P1.6): GTIN check digits (EAN-13/EAN-8/UPC-A/GTIN-14), symbol encoding for
 * EAN-13, EAN-8 and Code 128, and a framework-free SVG renderer (admin previews, labels, PDFs).
 * Pure functions — no DOM, no dependencies.
 *
 * Encoders return a module string: '1' = bar, '0' = space, one character per narrow module.
 */

// ---------------------------------------------------------------- GTIN check digits

/**
 * GS1 check digit for the data digits (weights 3,1,3,… from the RIGHT).
 * @param {string} data digits without the check digit (7, 11, 12 or 13 long)
 */
export function gtinCheckDigit(data) {
  if (!/^\d+$/.test(data)) throw new TypeError('GTIN data must be digits');
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const digit = data.charCodeAt(data.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** EAN-8, UPC-A (12), EAN-13 or GTIN-14 with a correct check digit. */
export const isValidGtin = (code) =>
  typeof code === 'string' &&
  /^\d+$/.test(code) &&
  GTIN_LENGTHS.has(code.length) &&
  gtinCheckDigit(code.slice(0, -1)) === code.at(-1);

/** Digits-only codes of a GTIN length must carry a valid check digit (likely a typo otherwise). */
export const looksLikeGtin = (code) => /^\d+$/.test(code) && GTIN_LENGTHS.has(code.length);

/**
 * Symbology used to print a code: valid EAN-13 / EAN-8 / UPC-A print as such; everything else
 * (SKU-style codes, GTIN-14) prints as Code 128.
 * @returns {'ean13' | 'ean8' | 'upca' | 'code128'}
 */
export function barcodeType(code) {
  if (isValidGtin(code)) {
    if (code.length === 13) return 'ean13';
    if (code.length === 8) return 'ean8';
    if (code.length === 12) return 'upca';
  }
  return 'code128';
}

// ---------------------------------------------------------------- EAN / UPC

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const invert = (bits) => bits.replace(/[01]/g, (b) => (b === '0' ? '1' : '0'));
/** Right-hand codes are the left (odd) codes inverted; even-parity codes are those reversed. */
const R = L.map(invert);
const G = R.map((bits) => [...bits].reverse().join(''));
/** First digit of an EAN-13 → parity of the 6 left digits. */
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];
const GUARD = '101';
const CENTER = '01010';

const withCheck = (code, length) => {
  if (code.length === length - 1) return code + gtinCheckDigit(code);
  if (!isValidGtin(code) || code.length !== length)
    throw new RangeError(`Invalid ${length}-digit GTIN`);
  return code;
};

/** EAN-13 (12 digits get their check digit appended) → 95 modules. */
export function encodeEan13(code) {
  const c = withCheck(code, 13);
  const parity = PARITY[c.charCodeAt(0) - 48];
  let left = '';
  for (let i = 1; i <= 6; i += 1) {
    const d = c.charCodeAt(i) - 48;
    left += parity[i - 1] === 'L' ? L[d] : G[d];
  }
  let right = '';
  for (let i = 7; i <= 12; i += 1) right += R[c.charCodeAt(i) - 48];
  return GUARD + left + CENTER + right + GUARD;
}

/** EAN-8 (7 digits get their check digit appended) → 67 modules. */
export function encodeEan8(code) {
  const c = withCheck(code, 8);
  const digit = (i) => c.charCodeAt(i) - 48;
  let out = GUARD;
  for (let i = 0; i < 4; i += 1) out += L[digit(i)];
  out += CENTER;
  for (let i = 4; i < 8; i += 1) out += R[digit(i)];
  return out + GUARD;
}

/** UPC-A is EAN-13 with a leading 0 (identical bars). */
export const encodeUpcA = (code) => encodeEan13(`0${withCheck(code, 12)}`);

// ---------------------------------------------------------------- Code 128

/** Bar/space widths of symbols 0–106 (106 = stop incl. its 2-module termination bar). */
const CODE128 = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 ' +
  '122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 ' +
  '321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 ' +
  '211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 ' +
  '213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 ' +
  '121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 ' +
  '241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 ' +
  '412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 ' +
  '211214 211232 2331112'
).split(' ');
const START_B = 104;
const START_C = 105;
const CODE_B = 100; // switch to set B (from C)
const STOP = 106;

const widthsToModules = (widths) =>
  [...widths].map((w, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(w))).join('');

/** Symbol values for `text`: set C for leading digit pairs (shorter), set B for the rest. */
function code128Values(text) {
  if (!/^[\x20-\x7E]+$/.test(text)) throw new RangeError('Code 128 supports printable ASCII only');
  const digitRun = /^\d+/.exec(text)?.[0].length ?? 0;
  const pairs = digitRun >= 4 ? digitRun - (digitRun % 2) : 0;
  const values = [];
  if (pairs) {
    values.push(START_C);
    for (let i = 0; i < pairs; i += 2) values.push(Number(text.slice(i, i + 2)));
    if (pairs < text.length) values.push(CODE_B);
  } else {
    values.push(START_B);
  }
  for (const ch of text.slice(pairs)) values.push(ch.charCodeAt(0) - 32);
  return values;
}

/** Code 128 (auto B/C) with mod-103 checksum → modules. */
export function encodeCode128(text) {
  const values = code128Values(text);
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  return [...values, checksum, STOP].map((v) => widthsToModules(CODE128[v])).join('');
}

// ---------------------------------------------------------------- rendering

/** Modules for a code in the symbology chosen by `barcodeType`. */
export function encodeBarcode(code) {
  const type = barcodeType(code);
  const modules =
    type === 'ean13'
      ? encodeEan13(code)
      : type === 'ean8'
        ? encodeEan8(code)
        : type === 'upca'
          ? encodeUpcA(code)
          : encodeCode128(code);
  return { type, modules };
}

/** Runs of bars: `[{ x, width }]` in modules (for SVG/canvas/thermal renderers). */
export function barRuns(modules) {
  const runs = [];
  for (let i = 0; i < modules.length;) {
    if (modules[i] !== '1') {
      i += 1;
      continue;
    }
    let j = i;
    while (modules[j] === '1') j += 1;
    runs.push({ x: i, width: j - i });
    i = j;
  }
  return runs;
}

const escapeXml = (s) =>
  s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/**
 * Standalone SVG for a code (quiet zones included). Sizes in user units (1 unit ≈ 1 px).
 * @param {string} code
 * @param {{ moduleWidth?: number, height?: number, quietZone?: number, showText?: boolean,
 *   fontSize?: number, fontFamily?: string }} [opts] `quietZone` in modules (≥ 10 for Code 128).
 */
export function barcodeSvg(
  code,
  {
    moduleWidth = 2,
    height = 60,
    quietZone = 10,
    showText = true,
    fontSize = 14,
    fontFamily = 'monospace',
  } = {},
) {
  const { modules } = encodeBarcode(code);
  const width = (modules.length + quietZone * 2) * moduleWidth;
  const textHeight = showText ? fontSize + 4 : 0;
  const bars = barRuns(modules)
    .map(
      (r) =>
        `<rect x="${(r.x + quietZone) * moduleWidth}" y="0" width="${r.width * moduleWidth}" height="${height}"/>`,
    )
    .join('');
  const text = showText
    ? `<text x="${width / 2}" y="${height + fontSize}" font-family="${fontFamily}" font-size="${fontSize}" text-anchor="middle">${escapeXml(code)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + textHeight}" viewBox="0 0 ${width} ${height + textHeight}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g>${text}</svg>`;
}
