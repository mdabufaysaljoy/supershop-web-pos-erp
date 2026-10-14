import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csrfHeaders, getCookie, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { Cart } from '../../cart/cart.model.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Order } from '../order.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const CHECKOUT = '/api/v1/checkout';
let app;
let rootToken;
const ids = {};
const events = [];
let off;

const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
};
const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
/** A shopper's browser: cart cookie + CSRF header, like the storefront. */
const shopper = () => {
  const agent = request.agent(app);
  return {
    agent,
    add: (variantId, qty) =>
      agent.post('/api/v1/cart/items').set(csrfHeaders).send({ variantId, qty }),
    cart: () => agent.get('/api/v1/cart?lang=en'),
    place: (body, key) => {
      const r = agent.post(`${CHECKOUT}?lang=en`).set(csrfHeaders);
      return (key ? r.set('Idempotency-Key', key) : r).send(body);
    },
  };
};
const FORM = {
  contact: { name: 'Sara Ali', phone: '٠٥١٢٣٤٥٦٧٨', email: 'Sara@Example.com' },
  address: { city: 'Riyadh', line1: 'King Fahd Rd, Building 12', postalCode: '12345' },
  paymentMethod: 'cod',
  note: 'Call on arrival',
};
const onHand = async (variantId, branchId = ids.web) =>
  (
    await ok(await root.get(`/api/v1/inventory/levels?variantId=${variantId}&branchId=${branchId}`))
  )[0]?.onHand ?? 0;

beforeAll(() => {
  off = eventBus.on(EVENTS.ORDER_CREATED, (e) => events.push(e.payload));
});
afterAll(() => off());

beforeEach(async () => {
  events.length = 0;
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Cart.init(), Order.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW })
  ).body.data.accessToken;

  const branch = async (code, fulfills) =>
    (
      await ok(
        await root.post('/api/v1/branches', { code, name: code, fulfillsOnlineOrders: fulfills }),
        201,
      )
    ).id;
  ids.web = await branch('WEB', true);
  ids.second = await branch('WEB2', true);
  ids.shop = await branch('SHOP', false);

  const shirt = await ok(
    await root.post('/api/v1/products', {
      name: 'Oxford Shirt',
      status: 'active',
      options: [{ name: 'Color', values: [{ label: 'Red' }] }],
      variants: [{ sku: 'OX-RED', optionValues: { color: 'red' }, price: 11500 }],
    }),
    201,
  );
  ids.shirtProduct = shirt.id;
  ids.red = shirt.variants[0].id;
  const rice = await ok(
    await root.post('/api/v1/products', {
      name: 'Basmati Rice',
      status: 'active',
      taxCategory: 'zero',
      variants: [{ sku: 'RICE-5', price: 3450 }],
    }),
    201,
  );
  ids.riceProduct = rice.id;
  ids.rice = rice.variants[0].id;
  await ok(
    await root.post('/api/v1/inventory/receive', {
      branchId: ids.web,
      lines: [
        { variantId: ids.red, qty: 10 },
        { variantId: ids.rice, qty: 10 },
      ],
    }),
    201,
  );
});

describe('placing an order', () => {
  it('creates a numbered order, snapshots lines and totals, takes stock and empties the cart', async () => {
    const s = shopper();
    await ok(await s.add(ids.red, 2));
    await ok(await s.add(ids.rice, 1));
    const res = await s.place(FORM);
    expect(res.status).toBe(201);
    const order = res.body.data;

    expect(order).toMatchObject({
      orderNo: 'ORD-000001',
      status: 'pending',
      lang: 'en',
      customer: { name: 'Sara Ali', phone: '+966512345678', email: 'sara@example.com' },
      payment: { method: 'cod', status: 'pending' },
      note: 'Call on arrival',
      currency: 'SAR',
    });
    expect(order.address).toMatchObject({ city: 'Riyadh', postalCode: '12345', district: null });
    expect(order.items.map((i) => [i.sku, i.qty, i.lineTotal])).toEqual([
      ['OX-RED', 2, 23000],
      ['RICE-5', 1, 3450],
    ]);
    expect(order.items[0].options).toEqual([{ name: 'Color', value: 'Red' }]);
    // 23000 incl. 15% VAT = 3000 VAT; rice is zero-rated.
    expect(order.totals).toEqual({
      itemCount: 3,
      subtotal: 26450,
      paymentFee: 0,
      deliveryFee: 0,
      net: 23450,
      vat: 3000,
      total: 26450,
    });
    expect(order.confirmationToken).toMatch(/^[\w-]{20,}$/);
    expect(res.headers['cache-control']).toBe('private, no-store');

    expect(await onHand(ids.red)).toBe(8);
    expect(await onHand(ids.rice)).toBe(9);
    expect((await ok(await s.cart())).items).toEqual([]);

    const stored = await Order.findOne({ orderNo: 'ORD-000001' }).lean();
    expect(stored.fulfillment).toHaveLength(1);
    expect(String(stored.branchId)).toBe(ids.web);
    expect(stored.confirmationTokenHash).not.toBe(order.confirmationToken);
    const movements = await ok(
      await root.get(`/api/v1/inventory/movements?type=sale&branchId=${ids.web}`),
    );
    expect(movements.map((m) => m.delta).sort()).toEqual([-1, -2]);

    await waitFor(() => events.length > 0);
    expect(events[0]).toMatchObject({ orderNo: 'ORD-000001', total: 26450, paymentMethod: 'cod' });
    expect((await s.place(FORM)).status).toBe(409); // cart is empty now
  });

  it('adds the delivery fee and keeps net + VAT = total', async () => {
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [
          { key: 'checkout.deliveryFee', value: 2300 },
          { key: 'checkout.freeDeliveryOver', value: 50000 },
        ],
      }),
    );
    const s = shopper();
    await ok(await s.add(ids.red, 1));
    const order = await ok(await s.place(FORM), 201);
    expect(order.totals).toMatchObject({ subtotal: 11500, deliveryFee: 2300, total: 13800 });
    expect(order.totals.net + order.totals.vat).toBe(order.totals.total);

    const s2 = shopper();
    await ok(await s2.add(ids.red, 5)); // 57500 ≥ 50000 → free delivery
    expect((await ok(await s2.place(FORM), 201)).totals.deliveryFee).toBe(0);
  });

  it('validates the form and the admin-defined checkout fields', async () => {
    const s = shopper();
    await ok(await s.add(ids.red, 1));
    const bad = await s.place({
      ...FORM,
      contact: { name: 'A1', phone: '123', email: 'nope' },
      address: { city: 'R', line1: 'x' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining([
        'contact.name',
        'contact.phone',
        'contact.email',
        'address.city',
        'address.line1',
      ]),
    );

    // The method list is admin data now (P4.2): an unknown key is refused by the shop's own list.
    const unknownMethod = await s.place({ ...FORM, paymentMethod: 'bitcoin' });
    expect(unknownMethod.status).toBe(400);
    expect(unknownMethod.body.error.details.map((d) => d.path)).toEqual(['paymentMethod']);

    const def = await ok(
      await root.post('/api/v1/custom-fields', {
        entity: 'checkout',
        key: 'gift_note',
        type: 'text',
        label: 'Gift message',
        required: true,
        visibility: 'public',
        max: 20,
      }),
      201,
    );
    expect(def.key).toBe('gift_note');
    const fields = await ok(await request(app).get(`${CHECKOUT}/fields?lang=en`));
    expect(fields).toEqual([
      expect.objectContaining({
        key: 'gift_note',
        label: 'Gift message',
        required: true,
        type: 'text',
      }),
    ]);

    const missing = await s.place(FORM);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0].path).toBe('customFields.gift_note');
    const tooLong = await s.place({ ...FORM, customFields: { gift_note: 'x'.repeat(30) } });
    expect(tooLong.status).toBe(400);

    const order = await ok(
      await s.place({ ...FORM, customFields: { gift_note: 'Happy Eid' } }),
      201,
    );
    expect(order.customFields).toEqual({ gift_note: 'Happy Eid' });
    expect(await Order.countDocuments()).toBe(1);
  });

  it('refuses when the cart is empty, blocked, or the shopper has not seen a change', async () => {
    const empty = shopper();
    expect((await empty.place(FORM)).status).toBe(409);
    expect((await empty.place(FORM)).body.error.code).toBe('CART_EMPTY');

    const s = shopper();
    await ok(await s.add(ids.rice, 2));
    await ok(await root.patch(`/api/v1/products/${ids.riceProduct}`, { status: 'archived' }));
    const blocked = await s.place(FORM);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({
      code: 'OUT_OF_STOCK',
      details: [expect.objectContaining({ status: 'unavailable', name: 'Basmati Rice' })],
    });

    // A change the shopper has NOT seen yet (price raised after they filled the form).
    const s2 = shopper();
    await ok(await s2.add(ids.red, 1));
    await ok(
      await root.patch(`/api/v1/products/${ids.shirtProduct}`, {
        variants: [{ id: ids.red, sku: 'OX-RED', optionValues: { color: 'red' }, price: 12900 }],
      }),
    );
    const changed = await s2.place(FORM);
    expect(changed.status).toBe(409);
    expect(changed.body.error).toMatchObject({
      code: 'PRICE_CHANGED',
      details: [
        expect.objectContaining({ notices: [{ code: 'price_changed', from: 11500, to: 12900 }] }),
      ],
    });
    // The cart now shows the new price; placing again goes through.
    expect((await ok(await s2.cart())).items[0].unitPrice).toBe(12900);
    const placed = await ok(await s2.place(FORM), 201);
    expect(placed.totals.subtotal).toBe(12900);
  });

  it('takes stock from several online branches and ignores branches that are not online', async () => {
    await ok(
      await root.post('/api/v1/inventory/transfer', {
        fromBranchId: ids.web,
        toBranchId: ids.second,
        lines: [{ variantId: ids.red, qty: 6 }],
      }),
      201,
    );
    await ok(
      await root.post('/api/v1/inventory/receive', {
        branchId: ids.shop,
        lines: [{ variantId: ids.red, qty: 50 }],
      }),
      201,
    );
    const s = shopper();
    await ok(await s.add(ids.red, 9)); // 4 in WEB + 6 in WEB2, SHOP doesn't count
    const order = await ok(await s.place(FORM), 201);
    expect(order.totals.itemCount).toBe(9);
    const stored = await Order.findOne({ _id: order.id }).lean();
    expect(stored.fulfillment).toHaveLength(2);
    // The branch that covers most of the order is used first (WEB2 had 6, WEB 4).
    expect(await onHand(ids.red, ids.second)).toBe(0);
    expect(await onHand(ids.red, ids.web)).toBe(1);
    expect(await onHand(ids.red, ids.shop)).toBe(50);
  });

  it('never oversells when two shoppers check out at once', async () => {
    await ok(
      await root.post('/api/v1/inventory/adjust', {
        branchId: ids.web,
        reason: 'correction',
        lines: [{ variantId: ids.rice, delta: -9 }],
      }),
      201,
    ); // 1 left
    const a = shopper();
    const b = shopper();
    await ok(await a.add(ids.rice, 1));
    await ok(await b.add(ids.rice, 1));
    const [ra, rb] = await Promise.all([a.place(FORM), b.place(FORM)]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const failed = ra.status === 409 ? ra : rb;
    expect(failed.body.error.code).toBe('OUT_OF_STOCK');
    expect(await onHand(ids.rice)).toBe(0);
    expect(await Order.countDocuments()).toBe(1);
  });
});

describe('idempotency and reading the order back', () => {
  it('returns the first order for a retried submit', async () => {
    const s = shopper();
    await ok(await s.add(ids.red, 1));
    const first = await s.place(FORM, 'checkout-key-0001');
    expect(first.status).toBe(201);
    const parallel = await Promise.all(
      Array.from({ length: 4 }, () => s.place(FORM, 'checkout-key-0001')),
    );
    parallel.forEach((r) => {
      expect(r.status).toBe(200);
      expect(r.headers['idempotent-replayed']).toBe('true');
      expect(r.body.data.orderNo).toBe(first.body.data.orderNo);
    });
    expect(await Order.countDocuments()).toBe(1);
    expect(await onHand(ids.red)).toBe(9);
    expect((await s.place(FORM, 'bad key!')).status).toBe(400);
  });

  it('shows the order again from the confirmation link, and by number + phone', async () => {
    const s = shopper();
    await ok(await s.add(ids.red, 1));
    const order = await ok(await s.place(FORM), 201);

    const byToken = await ok(
      await request(app).get(`${CHECKOUT}/confirmation?token=${order.confirmationToken}`),
    );
    expect(byToken).toMatchObject({ orderNo: order.orderNo, status: 'pending' });
    expect(byToken).not.toHaveProperty('confirmationToken');
    expect(
      (await request(app).get(`${CHECKOUT}/confirmation?token=${'x'.repeat(32)}`)).status,
    ).toBe(404);

    // Tracking (P3.6) tells the customer where the order is — not everything the order holds.
    const tracked = await ok(
      await request(app).get(`${CHECKOUT}/track?number=${order.orderNo}&phone=0512345678`),
    );
    expect(tracked).toMatchObject({
      orderNo: order.orderNo,
      status: 'pending',
      customerName: 'Sara Ali',
      city: 'Riyadh',
      totals: { itemCount: order.totals.itemCount, total: order.totals.total },
      payment: { method: 'cod', status: 'pending' },
    });
    expect(tracked.items.map((i) => i.name)).toEqual(order.items.map((i) => i.name));
    for (const field of ['address', 'customer', 'note', 'customFields', 'id'])
      expect(tracked).not.toHaveProperty(field);
    // An Arabic-Indic order number and a 05… phone find the same order (digits are normalized).
    const arabicDigits = order.orderNo.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    expect(
      (
        await request(app).get(
          `${CHECKOUT}/track?number=${encodeURIComponent(arabicDigits)}&phone=%2B966512345678`,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get(`${CHECKOUT}/track?number=${order.orderNo}&phone=0599999999`)).status,
    ).toBe(404);
    expect((await request(app).get(`${CHECKOUT}/track?number=NOPE&phone=0512345678`)).status).toBe(
      400,
    );
  });

  it('needs the CSRF header and keeps the cart cookie usable afterwards', async () => {
    const s = shopper();
    const added = await s.add(ids.red, 1);
    const cookie = getCookie(added, 'ss_cart');
    expect((await request(app).post(CHECKOUT).send(FORM)).status).toBe(403);
    await ok(await s.place(FORM), 201);
    // Same browser, same cookie: an empty cart, not someone else's order.
    const after = await ok(await s.cart());
    expect(after.items).toEqual([]);
    expect(cookie.value).toBeTruthy();
  });
});
