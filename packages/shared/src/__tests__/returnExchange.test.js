import { describe, expect, it } from 'vitest';
import {
  createReturnExchangeSchemas,
  ERROR_CODES,
  priceExchangeSettlement,
  priceReturnedLines,
  priceSale,
  renderReturnReceipt,
} from '../index.js';

const ORDER_ITEMS = [
  {
    productId: '507f1f77bcf86cd799439011',
    variantId: '507f1f77bcf86cd799439012',
    sku: 'SHIRT-M',
    name: 'Oxford Shirt',
    options: [{ name: 'Size', value: 'M' }],
    unitPrice: 11_500,
    qty: 3,
    taxCategory: 'standard',
    vatRateBps: 1500,
    discountTotal: 1_500,
    lineTotal: 33_000,
    net: 28_696,
    vat: 4_304,
  },
  {
    productId: '507f1f77bcf86cd799439013',
    variantId: '507f1f77bcf86cd799439014',
    sku: 'CAP-BLK',
    name: 'Wool Cap',
    options: [],
    unitPrice: 5_750,
    qty: 1,
    taxCategory: 'standard',
    vatRateBps: 1500,
    discountTotal: 0,
    lineTotal: 5_750,
    net: 5_000,
    vat: 750,
  },
];

describe('P6.6 returnExchange shared logic', () => {
  it('pro-rates partial returns and guarantees exact remainder on final return', () => {
    // First partial return: 1 of 3 shirts
    const r1 = priceReturnedLines(ORDER_ITEMS, [
      { variantId: '507f1f77bcf86cd799439012', qty: 1, disposition: 'restock' },
    ]);
    expect(r1.issues).toEqual([]);
    expect(r1.fullyReturned).toBe(false);
    expect(r1.totals).toEqual({
      itemCount: 1,
      subtotal: 11_500,
      discountTotal: 500,
      net: 9_565,
      vat: 1_435,
      total: 11_000,
    });

    // Second return: remaining 2 shirts + 1 cap → must equal 100% of remaining order
    const prior = new Map([
      [
        '507f1f77bcf86cd799439012',
        {
          qty: 1,
          lineTotal: r1.lines[0].lineTotal,
          net: r1.lines[0].net,
          vat: r1.lines[0].vat,
          discountTotal: r1.lines[0].discountTotal,
        },
      ],
    ]);
    const r2 = priceReturnedLines(
      ORDER_ITEMS,
      [
        { variantId: '507f1f77bcf86cd799439012', qty: 2, disposition: 'damaged' },
        { variantId: '507f1f77bcf86cd799439014', qty: 1, disposition: 'restock' },
      ],
      prior,
    );
    expect(r2.issues).toEqual([]);
    expect(r2.fullyReturned).toBe(true);
    expect(r1.lines[0].lineTotal + r2.lines[0].lineTotal).toBe(33_000);
    expect(r1.lines[0].vat + r2.lines[0].vat).toBe(4_304);
    expect(r1.lines[0].net + r2.lines[0].net).toBe(28_696);
    expect(r2.totals.total).toBe(22_000 + 5_750);
  });

  it('rejects returning more units than available on the order', () => {
    const res = priceReturnedLines(ORDER_ITEMS, [
      { variantId: '507f1f77bcf86cd799439014', qty: 2, disposition: 'restock' },
    ]);
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]).toMatchObject({
      path: 'returnLines.0.qty',
      code: ERROR_CODES.RETURN_QTY_EXCEEDED,
      available: 1,
      wanted: 2,
    });
  });

  it('enforces exchange rule (new total >= return credit) and computes customer difference', () => {
    const tax = { vatRateBps: 1500, pricesIncludeVat: true };
    const returnCredit = { total: 11_500, vat: 1_500, net: 10_000 };
    const lowerExchange = priceSale([{ unitPrice: 8_000, qty: 1, taxCategory: 'standard' }], {
      tax,
    });
    const rejected = priceExchangeSettlement({
      returnCredit,
      exchangePriced: lowerExchange,
    });
    expect(rejected.valid).toBe(false);
    expect(rejected.code).toBe(ERROR_CODES.EXCHANGE_VALUE_TOO_LOW);
    expect(rejected.shortfall).toBe(3_500);

    const higherExchange = priceSale([{ unitPrice: 15_000, qty: 1, taxCategory: 'standard' }], {
      tax,
    });
    const accepted = priceExchangeSettlement({
      returnCredit,
      exchangePriced: higherExchange,
      payments: [{ method: 'cash', amount: 5_000 }],
    });
    expect(accepted.valid).toBe(true);
    expect(accepted.differenceDue).toBe(3_500);
    expect(accepted.tender).toEqual({
      paid: 5_000,
      due: 0,
      change: 1_500,
    });
  });

  it('renders thermal return and exchange receipts via ESC/POS', () => {
    const rendered = renderReturnReceipt(
      {
        returnNo: 'EXC-000001',
        orderNo: 'POS-000042',
        type: 'exchange',
        createdAt: '2026-04-18T10:00:00.000Z',
        returnLines: [
          {
            name: 'Oxford Shirt',
            qty: 1,
            unitPrice: 11_500,
            lineTotal: 11_500,
            disposition: 'restock',
          },
        ],
        exchangeLines: [
          {
            name: 'Linen Jacket',
            qty: 1,
            unitPrice: 18_000,
            lineTotal: 18_000,
          },
        ],
        returnTotals: { total: 11_500, vat: 1_500 },
        exchangeTotals: { total: 18_000, vat: 2_348 },
        differenceDue: 6_500,
        payments: [{ method: 'cash', label: 'Cash', amount: 7_000 }],
        changeGiven: 500,
      },
      { shop: { name: 'Supershop', vatNumber: '300000000000003' }, branch: 'Main' },
    );

    const text = rendered.lines.join('\n');
    expect(text).toContain('EXCHANGE RECEIPT');
    expect(text).toContain('EXC-000001');
    expect(text).toContain('POS-000042');
    expect(text).toContain('Oxford Shirt (Restock)');
    expect(text).toContain('Linen Jacket');
    expect(text).toContain('SAR 65.00');
  });

  it('validates return and exchange schemas', () => {
    const schemas = createReturnExchangeSchemas();
    expect(() =>
      schemas.create.parse({
        orderId: '507f1f77bcf86cd799439011',
        type: 'exchange',
        returnLines: [{ variantId: '507f1f77bcf86cd799439012', qty: 1 }],
      }),
    ).toThrow();

    const parsed = schemas.create.parse({
      orderId: '507f1f77bcf86cd799439011',
      type: 'return',
      refundMethod: 'cash',
      returnLines: [{ variantId: '507f1f77bcf86cd799439012', qty: 1, disposition: 'damaged' }],
    });
    expect(parsed.returnLines[0].disposition).toBe('damaged');
  });
});
