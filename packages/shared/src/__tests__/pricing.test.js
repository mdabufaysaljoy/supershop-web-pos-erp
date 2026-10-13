import { describe, expect, it } from 'vitest';
import { priceLines, vatRateFor } from '../index.js';

const tax = { vatRateBps: 1500, pricesIncludeVat: true };

describe('priceLines', () => {
  it('extracts VAT per line from VAT-inclusive prices; parts add up exactly', () => {
    const r = priceLines(
      [
        { unitPrice: 11500, qty: 2 },
        { unitPrice: 999, qty: 3 },
      ],
      tax,
    );
    expect(r.lines).toEqual([
      { lineTotal: 23000, net: 20000, vat: 3000, gross: 23000 },
      { lineTotal: 2997, net: 2606, vat: 391, gross: 2997 }, // 390.9 → 391 (half up)
    ]);
    expect(r.totals).toEqual({
      itemCount: 5,
      subtotal: 25997,
      net: 22606,
      vat: 3391,
      total: 25997,
    });
    expect(r.totals.net + r.totals.vat).toBe(r.totals.total);
  });

  it('adds VAT on top of VAT-exclusive prices', () => {
    const r = priceLines([{ unitPrice: 10000, qty: 1 }], { ...tax, pricesIncludeVat: false });
    expect(r.totals).toEqual({
      itemCount: 1,
      subtotal: 10000,
      net: 10000,
      vat: 1500,
      total: 11500,
    });
  });

  it('applies zero-rated and exempt categories', () => {
    expect(vatRateFor('zero', { standardRateBps: 1500 })).toBe(0);
    expect(vatRateFor('exempt', { standardRateBps: 1500 })).toBe(0);
    expect(vatRateFor('standard', { standardRateBps: 1500 })).toBe(1500);
    const r = priceLines(
      [
        { unitPrice: 5000, qty: 1, taxCategory: 'zero' },
        { unitPrice: 11500, qty: 1 },
      ],
      tax,
    );
    expect(r.totals.vat).toBe(1500);
  });

  it('handles an empty cart and rejects fractional money', () => {
    expect(priceLines([], tax).totals).toEqual({
      itemCount: 0,
      subtotal: 0,
      net: 0,
      vat: 0,
      total: 0,
    });
    expect(() => priceLines([{ unitPrice: 10.5, qty: 1 }], tax)).toThrow();
  });
});
