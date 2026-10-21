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

// The QR generator itself lives in `qr.js`; re-exported here so callers keep one import.
export { qrMatrix, qrSvg } from './qr.js';
