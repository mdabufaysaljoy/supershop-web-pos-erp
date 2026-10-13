import { describe, expect, it } from 'vitest';
import { deliveryCharge, orderTotals, priceLines, vatRateFor } from '../index.js';

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

describe('deliveryCharge', () => {
  const base = { fee: 2300, itemsTotal: 10000, vatRateBps: 1500, pricesIncludeVat: true };

  it('splits VAT out of a VAT-inclusive fee', () => {
    expect(deliveryCharge(base)).toEqual({ gross: 2300, net: 2000, vat: 300, free: false });
  });

  it('adds VAT on top when prices exclude VAT, and can be untaxed', () => {
    expect(deliveryCharge({ ...base, pricesIncludeVat: false })).toEqual({
      gross: 2645,
      net: 2300,
      vat: 345,
      free: false,
    });
    expect(deliveryCharge({ ...base, taxed: false })).toEqual({
      gross: 2300,
      net: 2300,
      vat: 0,
      free: false,
    });
  });

  it('is free with no fee or above the free-delivery threshold', () => {
    expect(deliveryCharge({ ...base, fee: 0 }).free).toBe(true);
    expect(deliveryCharge({ ...base, freeOver: 10000 }).free).toBe(true);
    expect(deliveryCharge({ ...base, freeOver: 10001 }).free).toBe(false);
    expect(deliveryCharge({ ...base, freeOver: 0 }).free).toBe(false);
  });
});

describe('orderTotals', () => {
  it('adds delivery to the item totals, keeping net + vat = total', () => {
    const items = priceLines([{ unitPrice: 11500, qty: 2 }], tax).totals;
    const delivery = deliveryCharge({
      fee: 2300,
      itemsTotal: items.total,
      vatRateBps: 1500,
      pricesIncludeVat: true,
    });
    const t = orderTotals(items, delivery);
    expect(t).toEqual({
      itemCount: 2,
      subtotal: 23000,
      deliveryFee: 2300,
      net: 22000,
      vat: 3300,
      total: 25300,
    });
    expect(t.net + t.vat).toBe(t.total);
  });
});
