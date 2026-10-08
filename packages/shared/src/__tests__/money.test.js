import { describe, expect, it } from 'vitest';
import {
  allocate,
  formatMoney,
  fromMinor,
  fromNet,
  multiplyMinor,
  percentOf,
  percentToBps,
  splitGross,
  sumMinor,
  toMinor,
  vatFromGross,
  vatFromNet,
} from '../money.js';

describe('toMinor', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['-3.5', -350],
    [' 7.25 ', 725],
    ['١٢٫٥', 1250], // Arabic-Indic digits + Arabic decimal separator
    ['۱۲.۰۵', 1205],
    [12.5, 1250],
    [0.1 + 0.2, 30], // float noise within tolerance → exact 30 halalas
    [19.99, 1999],
  ])('%j → %i', (input, expected) => {
    expect(toMinor(input)).toBe(expected);
  });

  it.each([
    ['12.345'],
    ['1e3'],
    ['1,000'],
    ['abc'],
    [''],
    ['.5'],
    [1.005],
    [NaN],
    [Infinity],
    [null],
  ])('rejects %j', (input) => {
    expect(() => toMinor(input)).toThrow();
  });

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => toMinor('900719925474099.93')).toThrow(RangeError);
  });
});

describe('fromMinor / formatMoney', () => {
  it('formats without float math', () => {
    expect(fromMinor(1250)).toBe('12.50');
    expect(fromMinor(5)).toBe('0.05');
    expect(fromMinor(-1205)).toBe('-12.05');
    expect(fromMinor(0)).toBe('0.00');
    expect(() => fromMinor(1.5)).toThrow(TypeError);
  });

  it('formats currency per locale and digit style', () => {
    expect(formatMoney(123456)).toMatch(/1,234\.56/);
    expect(formatMoney(123456)).toMatch(/SAR|ر\.س|﷼/);
    expect(formatMoney(150, { locale: 'ar-SA', numberingSystem: 'arab' })).toMatch(/١٫٥٠/);
    expect(formatMoney(150, { locale: 'ar-SA', numberingSystem: 'latn' })).toMatch(/1[.,٫]50/);
  });
});

describe('arithmetic', () => {
  it('sumMinor / multiplyMinor stay integer and guard inputs', () => {
    expect(sumMinor(100, 250, [5, 5])).toBe(360);
    expect(multiplyMinor(1999, 3)).toBe(5997);
    expect(() => sumMinor(1, 0.5)).toThrow(TypeError);
    expect(() => multiplyMinor(100, 1.5)).toThrow(TypeError);
    expect(() => multiplyMinor(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });

  it('percentOf rounds half away from zero', () => {
    expect(percentOf(10000, 1500)).toBe(1500);
    expect(percentOf(333, 5000)).toBe(167); // 166.5 → 167
    expect(percentOf(-333, 5000)).toBe(-167);
    expect(percentOf(1, 4999)).toBe(0); // 0.4999 → 0
    expect(() => percentOf(100, 15.5)).toThrow(TypeError);
    expect(() => percentOf(100, -1)).toThrow(TypeError);
  });
});

describe('VAT (15% = 1500 bps)', () => {
  it('extracts VAT from VAT-inclusive prices', () => {
    expect(vatFromGross(11500, 1500)).toBe(1500);
    expect(vatFromGross(100, 1500)).toBe(13); // 13.04 → 13
    expect(vatFromGross(0, 1500)).toBe(0);
    expect(vatFromGross(11500, 0)).toBe(0);
  });

  it('net + vat always equals gross exactly', () => {
    for (let gross = 0; gross <= 5000; gross += 7) {
      const { net, vat } = splitGross(gross, 1500);
      expect(net + vat).toBe(gross);
      expect(Number.isInteger(vat)).toBe(true);
    }
  });

  it('adds VAT to net amounts', () => {
    expect(vatFromNet(10000, 1500)).toBe(1500);
    expect(fromNet(8696, 1500)).toEqual({ net: 8696, vat: 1304, gross: 10000 });
  });

  it('handles very large amounts without precision loss (BigInt internally)', () => {
    const gross = 9_000_000_000_000; // 90 billion SAR
    const { net, vat } = splitGross(gross, 1500);
    expect(net + vat).toBe(gross);
    expect(vat).toBe(1_173_913_043_478);
  });
});

describe('allocate', () => {
  it('sums exactly to the total', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('is proportional, deterministic and supports negatives', () => {
    expect(allocate(1000, [5000, 3000, 2000])).toEqual([500, 300, 200]);
    expect(allocate(-100, [1, 2])).toEqual([-33, -67]);
    expect(allocate(5, [0, 10])).toEqual([0, 5]);
  });

  it('fuzz: parts always sum to total and never go negative for positive totals', () => {
    for (let n = 0; n < 200; n += 1) {
      const total = Math.floor(Math.random() * 1_000_000);
      const weights = Array.from({ length: 1 + (n % 7) }, () => Math.floor(Math.random() * 50_000));
      if (weights.every((w) => w === 0)) weights[0] = 1;
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => p >= 0)).toBe(true);
    }
  });

  it('rejects bad weights', () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow(RangeError);
    expect(() => allocate(100, [1, -1])).toThrow(TypeError);
    expect(() => allocate(100, [1.5])).toThrow(TypeError);
  });
});

describe('percentToBps', () => {
  it('parses human percentages', () => {
    expect(percentToBps('15')).toBe(1500);
    expect(percentToBps(15.5)).toBe(1550);
    expect(percentToBps('٥')).toBe(500);
    expect(() => percentToBps('-1')).toThrow(RangeError);
  });
});
