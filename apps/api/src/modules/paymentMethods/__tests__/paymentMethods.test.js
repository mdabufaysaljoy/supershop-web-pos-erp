import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csrfHeaders } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { Cart } from '../../cart/cart.model.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { seedPaymentMethods } from '../index.js';

/** P4.2 — the shop decides what it accepts: enable, rename, reorder, price, add its own. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const BASE = '/api/v1/payment-methods';
let app;
let rootToken;
const ids = {};

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  del: (url) => request(app).delete(url).set('Authorization', `Bearer ${rootToken}`),
};
const methodsOf = async () => ok(await root.get(BASE));
const byKey = async (key) => (await methodsOf()).find((m) => m.key === key);
const publicList = async (query = '') => ok(await request(app).get(`${BASE}/public${query}`));

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Cart.init(), Order.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('the shop’s list', () => {
  it('starts with cash at the counter, cash on delivery, and the gateway awaiting its keys', async () => {
    expect(await methodsOf()).toMatchObject([
      { key: 'cash', type: 'cash', enabled: true, builtIn: true, position: 0 },
      { key: 'cod', type: 'cod', enabled: true, builtIn: true, position: 1 },
      { key: 'card', type: 'gateway', enabled: false, builtIn: true, position: 2 },
    ]);
    // Cash is for the counter (P6.1): a website cannot take it from a hand.
    expect((await publicList()).map((m) => m.key)).toEqual(['cod']);
  });

  it('seeds once, however often it runs', async () => {
    await seedPaymentMethods();
    await seedPaymentMethods();
    expect(await methodsOf()).toHaveLength(3);
  });

  it('shows the customer the label and instructions in their language', async () => {
    const [cod] = await publicList();
    expect(cod).toMatchObject({
      key: 'cod',
      label: 'Cash payment on delivery',
      instructions: 'Pay the courier when your order arrives.',
    });
    expect(cod.builtIn).toBeUndefined(); // internals stay internal
  });
});

describe('editing', () => {
  it('renames a built-in method and switches it off', async () => {
    const cod = await byKey('cod');
    const renamed = await ok(
      await root.patch(`${BASE}/${cod.id}`, { label: 'Pay the driver', enabled: false }),
    );
    expect(renamed.label.en).toBe('Pay the driver');
    expect(await publicList()).toEqual([]);
  });

  it('keeps built-in methods from being deleted', async () => {
    const cod = await byKey('cod');
    expect((await root.del(`${BASE}/${cod.id}`)).status).toBe(409);
  });

  it('refuses an empty patch and a fee above the ceiling', async () => {
    const cod = await byKey('cod');
    expect((await root.patch(`${BASE}/${cod.id}`, {})).status).toBe(400);
    expect((await root.patch(`${BASE}/${cod.id}`, { fee: { bps: 9000 } })).status).toBe(400);
    expect((await root.patch(`${BASE}/${cod.id}`, { minTotal: 5000, maxTotal: 1000 })).status).toBe(
      400,
    );
  });
});

describe('custom methods', () => {
  const bankTransfer = {
    key: 'bank-transfer',
    label: 'Bank transfer',
    instructions: 'Transfer to IBAN SA00 0000, then send us the receipt.',
    fee: { fixed: 0, bps: 0 },
  };

  it('adds one, puts it last and offers it to customers', async () => {
    const created = await ok(await root.post(BASE, bankTransfer), 201);
    expect(created).toMatchObject({ key: 'bank-transfer', type: 'offline', builtIn: false });
    expect((await publicList()).map((m) => m.key)).toEqual(['cod', 'bank-transfer']);
  });

  it('refuses a duplicate key and a built-in key', async () => {
    await ok(await root.post(BASE, bankTransfer), 201);
    expect((await root.post(BASE, bankTransfer)).status).toBe(409);
    expect((await root.post(BASE, { ...bankTransfer, key: 'cod' })).status).toBe(400);
  });

  it('can be deleted again', async () => {
    const created = await ok(await root.post(BASE, bankTransfer), 201);
    expect((await root.del(`${BASE}/${created.id}`)).status).toBe(204);
    expect(await byKey('bank-transfer')).toBeUndefined();
  });

  it('adds an MFS payment method and offers it at POS and online', async () => {
    const mfs = {
      key: 'bkash',
      type: 'mfs',
      label: 'bKash',
      instructions: 'Pay to merchant wallet 01700000000',
    };
    const created = await ok(await root.post(BASE, mfs), 201);
    expect(created).toMatchObject({ key: 'bkash', type: 'mfs', builtIn: false });

    // Available for POS sales
    const posMethods = await publicList('?channel=pos');
    expect(posMethods.map((m) => m.key)).toContain('bkash');

    // Also available for online checkout
    const onlineMethods = await publicList('?channel=online');
    expect(onlineMethods.map((m) => m.key)).toContain('bkash');
  });
});

describe('ordering', () => {
  it('takes the whole list in the new order', async () => {
    const extra = await ok(
      await root.post(BASE, { key: 'at-branch', label: 'Pay at the branch' }),
      201,
    );
    const [cash, cod, card] = await methodsOf();
    const reordered = await ok(
      await root.post(`${BASE}/reorder`, { ids: [extra.id, card.id, cod.id, cash.id] }),
    );
    expect(reordered.map((m) => m.key)).toEqual(['at-branch', 'card', 'cod', 'cash']);
    expect((await publicList()).map((m) => m.key)).toEqual(['at-branch', 'cod']);
  });

  it('refuses a partial or unknown list', async () => {
    const [cash, cod] = await methodsOf();
    expect((await root.post(`${BASE}/reorder`, { ids: [cod.id] })).status).toBe(400);
    expect(
      (
        await root.post(`${BASE}/reorder`, {
          ids: [cash.id, cod.id, '6ace0bc6096f3f7d66d774cc'],
        })
      ).status,
    ).toBe(404);
  });
});

describe('at checkout', () => {
  /** A basket worth 23000 halalas (2 × 115.00). */
  const shopper = async () => {
    const branch = await ok(
      await root.post('/api/v1/branches', { code: 'WEB', name: 'WEB', fulfillsOnlineOrders: true }),
      201,
    );
    const product = await ok(
      await root.post('/api/v1/products', {
        name: 'Oxford Shirt',
        status: 'active',
        variants: [{ sku: 'OX-1', price: 11500 }],
      }),
      201,
    );
    ids.variant = product.variants[0].id;
    await ok(
      await root.post('/api/v1/inventory/receive', {
        branchId: branch.id,
        lines: [{ variantId: ids.variant, qty: 10 }],
      }),
      201,
    );
    const agent = request.agent(app);
    await ok(
      await agent
        .post('/api/v1/cart/items')
        .set(csrfHeaders)
        .send({ variantId: ids.variant, qty: 2 }),
    );
    return (paymentMethod) =>
      agent
        .post('/api/v1/checkout?lang=en')
        .set(csrfHeaders)
        .set('Idempotency-Key', `k-${Math.random()}`)
        .send({
          contact: { name: 'Sara Ali', phone: '0512345678' },
          address: { city: 'Riyadh', line1: 'King Fahd Rd 12' },
          paymentMethod,
        });
  };

  it('charges the method fee and snapshots the method on the order', async () => {
    const cod = await byKey('cod');
    await ok(
      await root.patch(`${BASE}/${cod.id}`, {
        label: 'Cash on delivery',
        fee: { fixed: 500, bps: 250 },
      }),
    );
    const place = await shopper();
    const order = await ok(await place('cod'), 201);

    // 5.00 fixed + 2.5% of 230.00 = 5.75 → 10.75 SAR on top.
    expect(order.totals.paymentFee).toBe(1075);
    expect(order.totals.total).toBe(23000 + 1075);
    expect(order.payment).toMatchObject({
      method: 'cod',
      type: 'cod',
      label: 'Cash on delivery',
      fee: 1075,
    });
    // VAT on the fee follows the store's price mode, like delivery.
    expect(order.totals.vat).toBeGreaterThan(3000);
  });

  it('refuses a method the shop switched off, or one outside its limits', async () => {
    const cod = await byKey('cod');
    const place = await shopper();

    await ok(await root.patch(`${BASE}/${cod.id}`, { maxTotal: 10000 }));
    const tooBig = await place('cod');
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.details[0].path).toBe('paymentMethod');

    await ok(await root.patch(`${BASE}/${cod.id}`, { maxTotal: null, enabled: false }));
    expect((await place('cod')).status).toBe(400);

    await ok(await root.patch(`${BASE}/${cod.id}`, { enabled: true }));
    expect((await place('cod')).status).toBe(201);
  });

  it('lets a customer pay with a method the shop invented', async () => {
    await ok(await root.post(BASE, { key: 'bank-transfer', label: 'Bank transfer' }), 201);
    const place = await shopper();
    const order = await ok(await place('bank-transfer'), 201);
    expect(order.payment).toMatchObject({ method: 'bank-transfer', type: 'offline', fee: 0 });
    expect(order.payment.redirectUrl).toBeUndefined();
  });
});

describe('permissions', () => {
  it('needs settings.payments to read or change the list', async () => {
    const cashierToken = await (async () => {
      await ok(
        await root.post('/api/v1/staff', {
          name: 'Cashier One',
          email: 'cashier@shop.test',
          password: 'cashier-pass-123',
          roleId: String(await findSystemRoleId('cashier')),
        }),
        201,
      );
      const res = await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'cashier@shop.test', password: 'cashier-pass-123' });
      return res.body.data.accessToken;
    })();

    expect((await request(app).get(BASE)).status).toBe(401);
    expect(
      (await request(app).get(BASE).set('Authorization', `Bearer ${cashierToken}`)).status,
    ).toBe(403);
    // The public list stays public — the checkout needs it.
    expect((await request(app).get(`${BASE}/public`)).status).toBe(200);
  });
});
