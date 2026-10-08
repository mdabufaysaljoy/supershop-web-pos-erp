import { normalizeDigits } from './digits.js';

/**
 * Money utilities (CLAUDE.md §2.5). Rules:
 * - Amounts are integers in MINOR units (halalas: 1 SAR = 100 halalas). Never floats.
 * - Rates are integers in BASIS POINTS (1500 bps = 15%), so tax/discount math stays integer.
 * - Products/ratios are computed with BigInt and rounded once, half away from zero
 *   (commercial rounding, as used on Saudi tax invoices).
 * - Formatting to a decimal is for display only.
 */

export const MINOR_PER_MAJOR = 100;
export const BPS_DENOMINATOR = 10_000;

/** @param {unknown} value */
export const isMinor = (value) => Number.isSafeInteger(value);

/**
 * @param {unknown} value
 * @param {string} [name]
 * @returns {number}
 */
export function assertMinor(value, name = 'amount') {
  if (!isMinor(value)) throw new TypeError(`${name} must be a safe integer in minor units`);
  return /** @type {number} */ (value);
}

/** @param {unknown} bps */
function assertBps(bps) {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new TypeError('rate must be a non-negative integer in basis points');
  }
  return /** @type {number} */ (bps);
}

/** Integer division of BigInts, rounded half away from zero. */
function divRound(n, d) {
  if (d === 0n) throw new RangeError('division by zero');
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return negative ? -q : q;
}

function toSafeNumber(big) {
  const n = Number(big);
  if (!Number.isSafeInteger(n)) throw new RangeError('amount out of safe integer range');
  return n;
}

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a major-unit decimal ("12.5", "١٢٫٥", 12.5) into minor units (1250).
 * Rejects more than 2 decimals, exponents, thousands separators and non-finite numbers.
 * @param {string | number} value
 * @returns {number}
 */
export function toMinor(value) {
  let str;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('amount must be finite');
    // toFixed(2) then verify no precision was dropped (e.g. 1.005 is rejected, not rounded).
    str = value.toFixed(2);
    if (Math.abs(Number(str) - value) > 1e-9)
      throw new RangeError('amount has more than 2 decimals');
  } else if (typeof value === 'string') {
    str = normalizeDigits(value).trim();
  } else {
    throw new TypeError('amount must be a string or number');
  }
  const m = DECIMAL_RE.exec(str);
  if (!m) throw new RangeError('invalid amount format');
  const [, sign, whole, frac = ''] = m;
  const minor = BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
  return toSafeNumber(sign ? -minor : minor);
}

/**
 * Minor units → fixed 2-decimal string ("1250" → "12.50"). No float math.
 * @param {number} minor
 */
export function fromMinor(minor) {
  assertMinor(minor);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Locale-aware currency display. Display only — never parse the result back.
 * @param {number} minor
 * @param {{ currency?: string, locale?: string, numberingSystem?: 'latn' | 'arab' }} [opts]
 *   `numberingSystem` follows the admin digit-style setting (Western default).
 */
export function formatMoney(
  minor,
  { currency = 'SAR', locale = 'en-SA', numberingSystem = 'latn' } = {},
) {
  assertMinor(minor);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    numberingSystem,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / MINOR_PER_MAJOR);
}

/** Sum of minor amounts (throws on non-integers or overflow). */
export function sumMinor(...amounts) {
  const list = amounts.flat();
  return toSafeNumber(list.reduce((acc, a, i) => acc + BigInt(assertMinor(a, `amount[${i}]`)), 0n));
}

/**
 * Unit price × integer quantity.
 * @param {number} unitMinor
 * @param {number} qty
 */
export function multiplyMinor(unitMinor, qty) {
  assertMinor(unitMinor, 'unit price');
  if (!Number.isSafeInteger(qty)) throw new TypeError('quantity must be an integer');
  return toSafeNumber(BigInt(unitMinor) * BigInt(qty));
}

/**
 * Percentage of an amount: percentOf(10000, 1500) → 1500 (15% of 100.00 SAR).
 * @param {number} minor
 * @param {number} bps
 */
export function percentOf(minor, bps) {
  assertMinor(minor);
  assertBps(bps);
  return toSafeNumber(divRound(BigInt(minor) * BigInt(bps), BigInt(BPS_DENOMINATOR)));
}

/**
 * VAT contained in a VAT-INCLUSIVE amount: vatFromGross(11500, 1500) → 1500.
 * @param {number} grossMinor
 * @param {number} rateBps
 */
export function vatFromGross(grossMinor, rateBps) {
  assertMinor(grossMinor, 'gross');
  assertBps(rateBps);
  return toSafeNumber(
    divRound(BigInt(grossMinor) * BigInt(rateBps), BigInt(BPS_DENOMINATOR + rateBps)),
  );
}

/**
 * VAT to add on a VAT-EXCLUSIVE amount: vatFromNet(10000, 1500) → 1500.
 * @param {number} netMinor
 * @param {number} rateBps
 */
export const vatFromNet = (netMinor, rateBps) => percentOf(netMinor, rateBps);

/**
 * Splits a VAT-inclusive amount into { net, vat, gross } with net + vat === gross exactly.
 * @param {number} grossMinor
 * @param {number} rateBps
 */
export function splitGross(grossMinor, rateBps) {
  const vat = vatFromGross(grossMinor, rateBps);
  return { net: grossMinor - vat, vat, gross: grossMinor };
}

/**
 * Builds { net, vat, gross } from a VAT-exclusive amount.
 * @param {number} netMinor
 * @param {number} rateBps
 */
export function fromNet(netMinor, rateBps) {
  const vat = vatFromNet(netMinor, rateBps);
  return { net: netMinor, vat, gross: sumMinor(netMinor, vat) };
}

/**
 * Distributes `total` across `weights` proportionally so the parts sum EXACTLY to `total`
 * (largest-remainder method). Used to spread an order discount over lines, split payments, etc.
 * Ties go to the earlier index, so the result is deterministic.
 * @param {number} total
 * @param {number[]} weights non-negative integers (e.g. line totals in minor units)
 * @returns {number[]}
 */
export function allocate(total, weights) {
  assertMinor(total, 'total');
  if (!Array.isArray(weights) || weights.length === 0)
    throw new TypeError('weights must be a non-empty array');
  weights.forEach((w, i) => {
    if (!Number.isSafeInteger(w) || w < 0)
      throw new TypeError(`weights[${i}] must be a non-negative integer`);
  });
  const sumW = weights.reduce((a, w) => a + BigInt(w), 0n);
  if (sumW === 0n) throw new RangeError('weights must not all be zero');

  const sign = total < 0 ? -1n : 1n;
  const absTotal = BigInt(Math.abs(total));
  const parts = weights.map((w, i) => {
    const exact = absTotal * BigInt(w);
    return { i, base: exact / sumW, rem: exact % sumW };
  });
  let leftover = absTotal - parts.reduce((a, p) => a + p.base, 0n);
  [...parts]
    .sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i))
    .forEach((p) => {
      if (leftover > 0n) {
        p.base += 1n;
        leftover -= 1n;
      }
    });
  return parts.map((p) => toSafeNumber(p.base * sign));
}

/**
 * Parses a human percentage ("15", "15.5", 15) into basis points (1500, 1550). Max 2 decimals.
 * @param {string | number} percent
 */
export function percentToBps(percent) {
  const bps = toMinor(percent);
  if (bps < 0) throw new RangeError('percentage must not be negative');
  return bps;
}
