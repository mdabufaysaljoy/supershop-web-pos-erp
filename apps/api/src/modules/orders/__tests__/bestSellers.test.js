import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { getBestSellingProductIds } from '../order.service.js';
import { Order } from '../order.model.js';

/** P5.3 — what the "best selling" product rail counts: units sold, in states that are sales. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const KETTLE = new mongoose.Types.ObjectId();
const MUG = new mongoose.Types.ObjectId();
const LAMP = new mongoose.Types.ObjectId();
let seq = 0;

const line = (productId, qty) => ({
  productId,
  variantId: new mongoose.Types.ObjectId(),
  sku: `SKU-${++seq}`,
  name: 'Item',
  unitPrice: 1000,
  qty,
  vatRateBps: 1500,
  lineTotal: 1000 * qty,
  net: 870 * qty,
  vat: 130 * qty,
});

const placeOrder = (status, items, placedAt = new Date()) =>
  Order.create({
    orderNo: `SO-${++seq}`,
    status,
    customer: { name: 'A', phone: '+966500000000' },
    items,
    totals: { itemCount: 1, subtotal: 1000, net: 870, vat: 130, total: 1000 },
    payment: { method: 'cod' },
    placedAt,
  });

describe('best selling products', () => {
  it('ranks products by units sold and ignores orders that are not sales', async () => {
    await placeOrder('completed', [line(MUG, 3)]);
    await placeOrder('shipped', [line(KETTLE, 5), line(MUG, 1)]);
    await placeOrder('pending', [line(LAMP, 50)]); // not paid for — not a sale
    await placeOrder('cancelled', [line(LAMP, 50)]);

    expect(await getBestSellingProductIds({ limit: 5 })).toEqual([String(KETTLE), String(MUG)]);
  });

  it('counts only the window asked for, and no more than the rail shows', async () => {
    const longAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await placeOrder('completed', [line(LAMP, 99)], longAgo);
    await placeOrder('completed', [line(MUG, 2)]);

    expect(await getBestSellingProductIds({ limit: 10, days: 30 })).toEqual([String(MUG)]);
    expect(await getBestSellingProductIds({ limit: 1, days: 365 })).toEqual([String(LAMP)]);
  });
});
