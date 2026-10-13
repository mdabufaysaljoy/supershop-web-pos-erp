import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csrfHeaders, getCookie, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Cart } from '../cart.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const CART = '/api/v1/cart';
let app;
let rootToken;
const ids = {};
const events = [];
let off;

const root = {
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
};
const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
/** A shopper's browser: keeps cookies, sends the CSRF header like the storefront does. */
const shopper = (bearer) => {
  const agent = request.agent(app);
  const auth = (r) => (bearer ? r.set('Authorization', `Bearer ${bearer}`) : r);
  return {
    agent,
    get: () => auth(agent.get(`${CART}?lang=en`)),
    add: (variantId, qty) =>
      auth(agent.post(`${CART}/items`).set(csrfHeaders)).send({ variantId, qty }),
    set: (variantId, qty) =>
      auth(agent.patch(`${CART}/items/${variantId}`).set(csrfHeaders)).send({ qty }),
    remove: (variantId) => auth(agent.delete(`${CART}/items/${variantId}`).set(csrfHeaders)),
    clear: () => auth(agent.delete(CART).set(csrfHeaders)),
  };
};
const adjustStock = (variantId, delta) =>
  root.post('/api/v1/inventory/adjust', {
    branchId: ids.branch,
    reason: 'correction',
    lines: [{ variantId, delta }],
  });
const lineOf = (view, variantId) => view.items.find((i) => i.variantId === variantId);

beforeAll(() => {
  off = eventBus.on(EVENTS.CART_UPDATED, (e) => events.push(e.payload));
});
afterAll(() => off());

beforeEach(async () => {
  events.length = 0;
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Cart.init();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW })
  ).body.data.accessToken;

  ids.branch = (
    await ok(
      await root.post('/api/v1/branches', {
        code: 'WEB',
        name: 'Online',
        fulfillsOnlineOrders: true,
      }),
      201,
    )
  ).id;
  const shirt = await ok(
    await root.post('/api/v1/products', {
      name: 'Oxford Shirt',
      status: 'active',
      options: [{ name: 'Color', values: [{ label: 'Red' }, { label: 'Blue' }] }],
      variants: [
        { sku: 'OX-RED', optionValues: { color: 'red' }, price: 11500 },
        { sku: 'OX-BLUE', optionValues: { color: 'blue' }, price: 11500 },
      ],
    }),
    201,
  );
  ids.shirt = shirt.id;
  ids.red = shirt.variants.find((v) => v.sku === 'OX-RED').id;
  ids.blue = shirt.variants.find((v) => v.sku === 'OX-BLUE').id;
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
  const draft = await ok(
    await root.post('/api/v1/products', {
      name: 'Secret',
      variants: [{ sku: 'SEC-1', price: 100 }],
    }),
    201,
  );
  ids.draft = draft.variants[0].id;
  await ok(
    await root.post('/api/v1/inventory/receive', {
      branchId: ids.branch,
      lines: [
        { variantId: ids.red, qty: 5 },
        { variantId: ids.rice, qty: 50 },
        { variantId: ids.draft, qty: 5 },
      ],
    }),
    201,
  );
});

describe('guest cart', () => {
  it('creates the cart on first add, with an httpOnly cookie and priced lines', async () => {
    const s = shopper();
    const empty = await ok(await s.get());
    expect(empty).toMatchObject({ items: [], totals: { itemCount: 0, total: 0 } });
    expect(await Cart.countDocuments()).toBe(0); // reading never creates a cart

    const res = await s.add(ids.red, 2);
    const cookie = getCookie(res, 'ss_cart');
    expect(cookie.attrs).toMatch(/HttpOnly/i);
    expect(cookie.attrs).toMatch(/SameSite=Lax/i);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const view = res.body.data;
    expect(lineOf(view, ids.red)).toMatchObject({
      name: 'Oxford Shirt',
      options: [{ name: 'Color', value: 'Red' }],
      sku: 'OX-RED',
      unitPrice: 11500,
      qty: 2,
      maxQty: 5,
      lineTotal: 23000,
      status: 'ok',
      notices: [],
    });
    expect(view.totals).toEqual({
      itemCount: 2,
      subtotal: 23000,
      net: 20000,
      vat: 3000,
      total: 23000,
    });
    expect((await Cart.findOne().lean()).tokenHash).not.toBe(cookie.value); // only the hash is stored

    // Adding more than can be sold is capped and reported once.
    const more = await ok(await s.add(ids.red, 4));
    expect(lineOf(more, ids.red)).toMatchObject({
      qty: 5,
      notices: [{ code: 'qty_reduced', from: 6, to: 5 }],
    });
    expect(lineOf(await ok(await s.get()), ids.red).notices).toEqual([]);

    // Zero-rated items carry no VAT (the line's tax treatment travels with the view).
    const withRice = await ok(await s.add(ids.rice, 2));
    expect(lineOf(withRice, ids.rice).taxCategory).toBe('zero');
    expect(withRice.totals).toMatchObject({ itemCount: 7, total: 57500 + 6900, vat: 7500 });
    await waitFor(() => events.length >= 3);
    expect(events[0]).toMatchObject({ action: 'add', variantId: ids.red, qty: 2, previousQty: 0 });
  });

  it('rejects unsellable, out-of-stock and invalid adds; requires the CSRF header', async () => {
    const s = shopper();
    const out = await s.add(ids.blue, 1);
    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('OUT_OF_STOCK');
    expect((await s.add(ids.draft, 1)).status).toBe(404); // draft product
    expect((await s.add('64b000000000000000000009', 1)).status).toBe(404);
    expect((await s.add(ids.red, 0)).status).toBe(400);
    expect((await s.add('nope', 1)).status).toBe(400);
    const noCsrf = await request(app).post(`${CART}/items`).send({ variantId: ids.red, qty: 1 });
    expect(noCsrf.status).toBe(403);
    expect(await Cart.countDocuments()).toBe(0);
  });

  it('sets quantities, removes and clears; other shoppers and forged cookies see nothing', async () => {
    const s = shopper();
    await ok(await s.add(ids.red, 1));
    await ok(await s.add(ids.rice, 1));
    expect(lineOf(await ok(await s.set(ids.rice, 40)), ids.rice).qty).toBe(40);
    const capped = await ok(await s.set(ids.rice, 9999));
    expect(lineOf(capped, ids.rice)).toMatchObject({
      qty: 50,
      notices: [{ code: 'qty_reduced', from: 9999, to: 50 }],
    });
    expect((await ok(await s.set(ids.rice, 0))).items.map((i) => i.sku)).toEqual(['OX-RED']);
    expect((await s.set(ids.rice, 2)).status).toBe(404); // not in cart
    expect((await ok(await s.remove(ids.red))).items).toEqual([]);
    expect((await s.remove(ids.red)).status).toBe(404);
    await ok(await s.add(ids.red, 1));
    expect((await ok(await s.clear())).items).toEqual([]);

    await ok(await s.add(ids.red, 1));
    expect((await ok(await shopper().get())).items).toEqual([]);
    const forged = await request(app)
      .get(CART)
      .set('Cookie', 'ss_cart=forged-token-forged-token-123');
    expect(forged.body.data.items).toEqual([]);
    expect(getCookie(forged, 'ss_cart').attrs).toMatch(/Expires=Thu, 01 Jan 1970/); // cleared
  });

  it('never loses an update when the same cart is changed in parallel', async () => {
    const s = shopper();
    await ok(await s.add(ids.rice, 1));
    const results = await Promise.all(Array.from({ length: 9 }, () => s.add(ids.rice, 1)));
    results.forEach((r) => expect(r.status).toBe(200));
    expect(lineOf(await ok(await s.get()), ids.rice).qty).toBe(10);
    expect(await Cart.countDocuments()).toBe(1);
  });
});

describe('revalidation', () => {
  it('reports price changes once, caps to stock, flags out-of-stock and unavailable lines', async () => {
    const s = shopper();
    await ok(await s.add(ids.red, 4));
    await ok(await s.add(ids.rice, 3));

    await ok(
      await root.patch(`/api/v1/products/${ids.shirt}`, {
        variants: [
          { id: ids.red, sku: 'OX-RED', optionValues: { color: 'red' }, price: 9900 },
          { id: ids.blue, sku: 'OX-BLUE', optionValues: { color: 'blue' }, price: 11500 },
        ],
      }),
    );
    await ok(await adjustStock(ids.red, -3), 201); // 2 left
    let view = await ok(await s.get());
    expect(lineOf(view, ids.red)).toMatchObject({
      unitPrice: 9900,
      qty: 2,
      lineTotal: 19800,
      notices: [
        { code: 'qty_reduced', from: 4, to: 2 },
        { code: 'price_changed', from: 11500, to: 9900 },
      ],
    });
    expect(lineOf(await ok(await s.get()), ids.red).notices).toEqual([]); // shown once

    await ok(await adjustStock(ids.red, -2), 201); // sold out
    view = await ok(await s.get());
    expect(lineOf(view, ids.red)).toMatchObject({
      status: 'out_of_stock',
      qty: 2,
      lineTotal: null,
      maxQty: 0,
    });
    expect(view.totals).toMatchObject({ itemCount: 3, total: 10350 }); // only rice counts
    // Out of stock: can lower the quantity, not raise it.
    expect(lineOf(await ok(await s.set(ids.red, 5)), ids.red).qty).toBe(2);
    expect(lineOf(await ok(await s.set(ids.red, 1)), ids.red).qty).toBe(1);

    await ok(await root.patch(`/api/v1/products/${ids.riceProduct}`, { status: 'archived' }));
    view = await ok(await s.get());
    expect(lineOf(view, ids.rice)).toMatchObject({ status: 'unavailable', lineTotal: null });
    expect(view.totals.total).toBe(0);
  });

  it('adds VAT on top when prices exclude VAT', async () => {
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [{ key: 'tax.pricesIncludeVat', value: false }],
      }),
    );
    const view = await ok(await shopper().add(ids.red, 1));
    expect(view).toMatchObject({
      pricesIncludeVat: false,
      totals: { subtotal: 11500, vat: 1725, total: 13225 },
    });
  });
});

describe('customer cart', () => {
  const register = async (email) =>
    (
      await request(app).post('/api/v1/customers/register').send({
        name: 'Sara Ali',
        email,
        password: 'my-secret-pass-1',
      })
    ).body.data.accessToken;

  it('merges the guest cart into the customer cart on the first request after sign-in', async () => {
    const token = await register('sara@shop.test');
    // Signed in on another device: red × 2 in the customer cart.
    await ok(await shopper(token).add(ids.red, 2));

    // As a guest on this device…
    const guest = shopper();
    await ok(await guest.add(ids.red, 1));
    await ok(await guest.add(ids.rice, 2));
    expect(await Cart.countDocuments()).toBe(2);

    // …then signs in: same browser (cookie) + token.
    const merged = await guest.agent.get(`${CART}?lang=en`).set('Authorization', `Bearer ${token}`);
    expect(merged.status).toBe(200);
    expect(Object.fromEntries(merged.body.data.items.map((i) => [i.sku, i.qty]))).toEqual({
      'OX-RED': 3,
      'RICE-5': 2,
    });
    expect(getCookie(merged, 'ss_cart').attrs).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await Cart.countDocuments()).toBe(1);
    const [cart] = await Cart.find().lean();
    expect(cart).toMatchObject({ tokenHash: null, expiresAt: null });
    expect(String(cart.customerId)).toBeTruthy();

    // Signed out again, the browser starts a fresh guest cart.
    expect((await ok(await shopper().get())).items).toEqual([]);
  });

  it('adopts the guest cart when the customer has none; invalid tokens are rejected', async () => {
    const token = await register('omar@shop.test');
    const guest = shopper();
    await ok(await guest.add(ids.rice, 4));
    const adopted = await guest.agent.get(CART).set('Authorization', `Bearer ${token}`);
    expect(adopted.body.data.items.map((i) => i.qty)).toEqual([4]);
    expect(await Cart.countDocuments({ customerId: { $ne: null } })).toBe(1);
    await waitFor(() => events.some((e) => e.action === 'merge'));

    const bad = await request(app).get(CART).set('Authorization', 'Bearer a.b.c');
    expect(bad.status).toBe(401);
    // A staff token is not a customer token.
    expect((await request(app).get(CART).set('Authorization', `Bearer ${rootToken}`)).status).toBe(
      401,
    );
  });
});
