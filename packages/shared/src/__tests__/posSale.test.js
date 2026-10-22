import { describe, expect, it } from 'vitest';
import { addTender, createPosSchemas, discountAmount, priceSale, tenderSummary } from '../index.js';

/** P6.1 — what a sale at the counter costs. Money, so every case is pinned down. */
const TAX = { vatRateBps: 1500, pricesIncludeVat: true };
const line = (unitPrice, qty = 1, over = {}) => ({ unitPrice, qty, ...over });

describe('a discount', () => {
  it('takes a percentage in basis points, or money off', () => {
    expect(discountAmount({ type: 'percent', value: 1000 }, 10_000)).toBe(1000);
    expect(discountAmount({ type: 'amount', value: 2500 }, 10_000)).toBe(2500);
  });

  it('never takes more than there is, and never adds', () => {
    expect(discountAmount({ type: 'amount', value: 99_999 }, 10_000)).toBe(10_000);
    expect(discountAmount({ type: 'percent', value: -500 }, 10_000)).toBe(0);
    expect(discountAmount(null, 10_000)).toBe(0);
    expect(discountAmount({ type: 'amount', value: 500 }, 0)).toBe(0);
  });

  it('rounds to the halala', () => {
    expect(discountAmount({ type: 'percent', value: 333 }, 1999)).toBe(67); // 66.57 → 67
  });
});

describe('pricing a sale', () => {
  it('prices plain lines exactly as the storefront would', () => {
    const { lines, totals } = priceSale([line(10_000, 2), line(2500)], { tax: TAX });
    expect(totals).toEqual({
      itemCount: 3,
      subtotal: 22_500,
      discountTotal: 0,
      net: 19_565,
      vat: 2935,
      total: 22_500,
    });
    expect(lines[0]).toMatchObject({ lineTotal: 20_000, vat: 2609, discountTotal: 0 });
  });

  it('applies a line discount before VAT, so the customer is taxed on what they pay', () => {
    const { lines, totals } = priceSale(
      [line(10_000, 1, { discount: { type: 'percent', value: 1000 } })],
      {
        tax: TAX,
      },
    );
    expect(lines[0]).toMatchObject({ discountTotal: 1000, lineTotal: 9000, net: 7826, vat: 1174 });
    expect(totals).toMatchObject({ subtotal: 10_000, discountTotal: 1000, total: 9000 });
  });

  it('spreads an order discount across the lines so the parts add up exactly', () => {
    const { lines, totals } = priceSale([line(10_000), line(3333), line(1)], {
      orderDiscount: { type: 'amount', value: 1000 },
      tax: TAX,
    });
    expect(lines.map((l) => l.discountTotal).reduce((a, b) => a + b)).toBe(1000);
    expect(totals.total).toBe(13_334 - 1000);
    expect(lines.map((l) => l.lineTotal).reduce((a, b) => a + b)).toBe(totals.total);
    expect(lines[0].net + lines[0].vat).toBe(lines[0].lineTotal);
  });

  it('counts both discounts, line first then the rest of the basket', () => {
    const { totals } = priceSale(
      [line(10_000, 3, { discount: { type: 'percent', value: 1000 } }), line(3333)],
      { orderDiscount: { type: 'amount', value: 1000 }, tax: TAX },
    );
    expect(totals.subtotal).toBe(33_333);
    expect(totals.discountTotal).toBe(4000); // 3000 off the first line, then 1000 off the rest
    expect(totals.total).toBe(29_333);
    expect(totals.net + totals.vat).toBe(totals.total);
  });

  it('cannot discount a basket below zero', () => {
    const { totals } = priceSale([line(5000)], {
      orderDiscount: { type: 'amount', value: 9999 },
      tax: TAX,
    });
    expect(totals).toMatchObject({ discountTotal: 5000, total: 0, vat: 0 });
  });

  it('keeps a zero-VAT line out of the tax', () => {
    const { lines, totals } = priceSale([line(10_000, 1, { taxCategory: 'zero' }), line(10_000)], {
      tax: TAX,
    });
    expect(lines[0].vat).toBe(0);
    expect(totals.vat).toBe(1304);
  });

  it('adds VAT on top when the shop prices without it', () => {
    const { totals } = priceSale([line(10_000)], {
      tax: { vatRateBps: 1500, pricesIncludeVat: false },
    });
    expect(totals).toMatchObject({ net: 10_000, vat: 1500, total: 11_500 });
  });
});

describe('what has been tendered', () => {
  it('adds the payments up and says what is left or owed back', () => {
    expect(tenderSummary(10_000, [{ amount: 4000 }, { amount: 7000 }])).toEqual({
      paid: 11_000,
      due: 0,
      change: 1000,
    });
    expect(tenderSummary(10_000, [{ amount: 4000 }])).toEqual({ paid: 4000, due: 6000, change: 0 });
    expect(tenderSummary(10_000)).toEqual({ paid: 0, due: 10_000, change: 0 });
  });
});

describe('what the till may send', () => {
  const schemas = createPosSchemas({ maxDiscountBps: 2000 });

  it('refuses a discount beyond what the shop allows, naming the field', () => {
    const bad = schemas.sale.safeParse({
      branchId: '6acf9f65e6a82ebbbbef0583',
      items: [
        {
          variantId: '6acf9f65e6a82ebbbbef0584',
          qty: 1,
          discount: { type: 'percent', value: 5000 },
        },
      ],
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(bad.success).toBe(false);
    expect(bad.error.issues[0].path.join('.')).toBe('items.0.discount.value');
  });

  it('insists a named customer can be reached, and lets a walk-in stay anonymous', () => {
    const base = {
      branchId: '6acf9f65e6a82ebbbbef0583',
      items: [{ variantId: '6acf9f65e6a82ebbbbef0584', qty: 1 }],
      payments: [{ method: 'cash', amount: 100 }],
    };
    expect(schemas.sale.safeParse(base).data.customer).toEqual({ mode: 'walkin' });
    expect(
      schemas.sale
        .safeParse({ ...base, customer: { mode: 'contact', name: 'Sara' } })
        .error.issues[0].path.join('.'),
    ).toBe('customer.phone');
    expect(
      schemas.sale.safeParse({
        ...base,
        customer: { mode: 'contact', name: 'Sara', phone: '0501234567' },
      }).data.customer.phone,
    ).toBe('+966501234567');
  });

  it('takes a customer the till already knows, by id', () => {
    const parsed = schemas.sale.parse({
      branchId: '6acf9f65e6a82ebbbbef0583',
      items: [{ variantId: '6acf9f65e6a82ebbbbef0584', qty: 1 }],
      payments: [{ method: 'cash', amount: 100 }],
      customer: {
        mode: 'contact',
        customerId: '6acf9f65e6a82ebbbbef0585',
        name: 'Sara Ali',
        phone: '0501234567',
      },
    });
    expect(parsed.customer).toEqual({
      mode: 'contact',
      customerId: '6acf9f65e6a82ebbbbef0585',
      name: 'Sara Ali',
      phone: '+966501234567',
    });
  });

  it('reads an empty field as "not given" rather than refusing the sale', () => {
    const base = {
      branchId: '6acf9f65e6a82ebbbbef0583',
      items: [{ variantId: '6acf9f65e6a82ebbbbef0584', qty: 1 }],
      payments: [{ method: 'cash', amount: 100 }],
    };
    // A till leaves the fields it has nothing for empty — that is not a mistake to correct.
    expect(
      schemas.sale.parse({
        ...base,
        customer: { mode: 'contact', name: 'Nora', phone: '0599999999', email: '' },
      }).customer,
    ).toEqual({ mode: 'contact', name: 'Nora', phone: '+966599999999' });
    expect(
      schemas.sale.parse({
        ...base,
        customer: { mode: 'contact', customerId: '6acf9f65e6a82ebbbbef0585', email: null },
      }).customer,
    ).toEqual({ mode: 'contact', customerId: '6acf9f65e6a82ebbbbef0585' });
  });

  it('asks for at least one line and one payment', () => {
    expect(
      schemas.sale.safeParse({ branchId: '6acf9f65e6a82ebbbbef0583', items: [], payments: [] })
        .success,
    ).toBe(false);
  });
});

/** P6.1 — a split worked backwards: the bill is settled, then a tender is carved out of it. */
describe('taking one more tender onto a settled ticket', () => {
  const CARD = { method: 'card', amount: 11_500, auto: true };

  it('carves a later tender out of the method that settled the balance', () => {
    // Card took the lot; the customer then puts 50 on cash. Cash is not extra money.
    const after = addTender([{ ...CARD }], { method: 'cash', amount: 5000 }, 11_500);
    expect(after).toEqual([
      { method: 'card', amount: 6500, auto: true },
      { method: 'cash', amount: 5000 },
    ]);
    expect(tenderSummary(11_500, after)).toEqual({ paid: 11_500, due: 0, change: 0 });
  });

  it('keeps carving as more methods are added, and drops a tender it empties', () => {
    let t = addTender([{ ...CARD }], { method: 'cash', amount: 5000 }, 11_500);
    t = addTender(t, { method: 'stcpay', amount: 3000 }, 11_500);
    expect(t).toEqual([
      { method: 'card', amount: 3500, auto: true },
      { method: 'cash', amount: 5000 },
      { method: 'stcpay', amount: 3000 },
    ]);
    // One more that swallows the rest of the card: the card line goes away entirely.
    t = addTender(t, { method: 'transfer', amount: 3500 }, 11_500);
    expect(t.map((p) => p.method)).toEqual(['cash', 'stcpay', 'transfer']);
    expect(tenderSummary(11_500, t)).toEqual({ paid: 11_500, due: 0, change: 0 });
  });

  it('never rewrites an amount the cashier typed: the new tender is capped instead', () => {
    const typed = [{ method: 'cash', amount: 11_500 }];
    const after = addTender(typed, { method: 'card', amount: 5000 }, 11_500);
    expect(after).toEqual(typed); // nothing to carve, nothing owed — the card is refused
  });

  it('still lets cash be handed over long, which comes back as change', () => {
    const after = addTender([], { method: 'cash', amount: 12_000 }, 11_500, { takesChange: true });
    expect(tenderSummary(11_500, after)).toEqual({ paid: 12_000, due: 0, change: 500 });
  });

  it('adds a tender that fits as it is, and ignores an empty one', () => {
    expect(addTender([], { method: 'cash', amount: 5000 }, 11_500)).toEqual([
      { method: 'cash', amount: 5000 },
    ]);
    expect(addTender([{ ...CARD }], { method: 'cash', amount: 0 }, 11_500)).toEqual([CARD]);
  });
});
