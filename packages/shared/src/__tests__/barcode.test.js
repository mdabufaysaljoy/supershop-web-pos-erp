import B from 'jsbarcode/bin/barcodes/CODE128/CODE128B.js';
import C from 'jsbarcode/bin/barcodes/CODE128/CODE128C.js';
import E13 from 'jsbarcode/bin/barcodes/EAN_UPC/EAN13.js';
import E8 from 'jsbarcode/bin/barcodes/EAN_UPC/EAN8.js';
import UPC from 'jsbarcode/bin/barcodes/EAN_UPC/UPC.js';
import { describe, expect, it } from 'vitest';
import {
  barcodeSvg,
  barcodeType,
  barRuns,
  encodeBarcode,
  encodeCode128,
  encodeEan13,
  encodeEan8,
  encodeUpcA,
  gtinCheckDigit,
  isValidGtin,
} from '../barcode.js';

// jsbarcode (MIT, dev-only) is the reference implementation the encoders are checked against.
const oracle = (Cls, text) => {
  const Ctor = Cls.default ?? Cls; // CJS interop differs between Node and Vite
  const out = new Ctor(text, {}).encode();
  return Array.isArray(out) ? out.map((p) => p.data).join('') : out.data;
};
// Deterministic pseudo-random digits.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join('');

describe('GTIN check digits', () => {
  it('computes known check digits', () => {
    expect(gtinCheckDigit('400638133393')).toBe('1'); // EAN-13 4006381333931
    expect(gtinCheckDigit('9638507')).toBe('4'); // EAN-8 96385074
    expect(gtinCheckDigit('03600029145')).toBe('2'); // UPC-A 036000291452
    expect(gtinCheckDigit('1001234567890')).toBe('2'); // GTIN-14
  });
  it('validates and classifies', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
    expect(barcodeType('4006381333931')).toBe('ean13');
    expect(barcodeType('96385074')).toBe('ean8');
    expect(barcodeType('036000291452')).toBe('upca');
    expect(barcodeType('4006381333932')).toBe('code128'); // bad check digit → not printed as EAN
    expect(barcodeType('SKU-001')).toBe('code128');
  });
});

describe('symbol encoding matches the reference implementation', () => {
  it('EAN-13, EAN-8 and UPC-A (200 random codes each)', () => {
    for (let i = 0; i < 200; i += 1) {
      const d12 = digits(12);
      expect(encodeEan13(d12)).toBe(oracle(E13, d12));
      expect(encodeEan13(d12)).toHaveLength(95);
      const d7 = digits(7);
      expect(encodeEan8(d7)).toBe(oracle(E8, d7 + gtinCheckDigit(d7)));
      const d11 = digits(11);
      expect(encodeUpcA(d11)).toBe(oracle(UPC, d11 + gtinCheckDigit(d11)));
    }
  });

  it('Code 128: every set-B character and every set-C digit pair', () => {
    let ascii = '';
    for (let c = 32; c <= 126; c += 1) ascii += String.fromCharCode(c);
    // Chunks that don't start with 4+ digits (those switch to set C by design).
    for (let i = 0; i < ascii.length; i += 10) {
      const chunk = `X${ascii.slice(i, i + 10)}`;
      expect(encodeCode128(chunk)).toBe(oracle(B, chunk));
    }
    let pairs = '';
    for (let n = 0; n < 100; n += 1) pairs += String(n).padStart(2, '0');
    expect(encodeCode128(pairs)).toBe(oracle(C, pairs));
    expect(encodeCode128('SKU-0001')).toBe(oracle(B, 'SKU-0001'));
  });

  it('Code 128 rejects non-printable input', () => {
    expect(() => encodeCode128('é')).toThrow(RangeError);
    expect(() => encodeCode128('a\nb')).toThrow(RangeError);
  });
});

describe('rendering', () => {
  it('bar runs and SVG', () => {
    expect(barRuns('1101001')).toEqual([
      { x: 0, width: 2 },
      { x: 3, width: 1 },
      { x: 6, width: 1 },
    ]);
    const { type, modules } = encodeBarcode('4006381333931');
    expect(type).toBe('ean13');
    const svg = barcodeSvg('4006381333931', { moduleWidth: 1, quietZone: 10 });
    expect(svg).toContain(`width="${modules.length + 20}"`);
    expect(svg.match(/<rect x=/g)).toHaveLength(barRuns(modules).length);
    expect(barcodeSvg('A<B', { showText: true })).not.toContain('A<B'); // never valid in our charset, but escaped anyway
  });
});
