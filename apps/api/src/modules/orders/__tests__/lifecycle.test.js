import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { csrfHeaders, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { Cart } from '../../cart/cart.model.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { Order } from '../order.model.js';

/** P4.3 — an order's life: who may move it where, what that costs the shelf. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const ORDERS = '/api/v1/orders';
let app;
let rootToken;
const ids = {};
const events = [];
const offs = [];

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const as = (token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
});
const root = () => as(rootToken);

/** Places an order of 2 shirts (23000) paid by cash on delivery. */
const placeOrder = async (paymentMethod = 'cod') => {
  const agent = request.agent(app);
  await ok(
    await agent
      .post('/api/v1/cart/items')
      .set(csrfHeaders)
      .send({ variantId: ids.variant, qty: 2 }),
  );
  return ok(
    await agent
      .post('/api/v1/checkout?lang=en')
      .set(csrfHeaders)
      .set('Idempotency-Key', `k-${Math.random()}`)
      .send({
        contact: { name: 'Sara Ali', phone: '0512345678' },
        address: { city: 'Riyadh', line1: 'King Fahd Rd 12' },
        paymentMethod,
      }),
    201,
  );
};
const onHand = async () =>
  (
    await ok(
      await root().get(`/api/v1/inventory/levels?variantId=${ids.variant}&branchId=${ids.branch}`),
    )
  )[0].onHand;
const move = (id, to, body = {}) => root().post(`${ORDERS}/${id}/transitions`, { to, ...body });
const statusOf = async (id) => (await Order.findById(id).lean()).status;

beforeAll(() => {
  for (const name of [
    EVENTS.ORDER_STATUS_CHANGED,
    EVENTS.ORDER_SHIPPED,
    EVENTS.ORDER_CANCELLED,
    EVENTS.ORDER_COMPLETED,
    EVENTS.SHIPMENT_CREATED,
  ])
    offs.push(eventBus.on(name, (e) => events.push({ name: e.name, ...e.payload })));
});
afterAll(() => offs.forEach((off) => off()));

beforeEach(async () => {
  events.length = 0;
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

  ids.branch = (
    await ok(
      await root().post('/api/v1/branches', {
        code: 'WEB',
        name: 'WEB',
        fulfillsOnlineOrders: true,
      }),
      201,
    )
  ).id;
  const product = await ok(
    await root().post('/api/v1/products', {
      name: 'Oxford Shirt',
      status: 'active',
      variants: [{ sku: 'OX-1', price: 11500 }],
    }),
    201,
  );
  ids.variant = product.variants[0].id;
  await ok(
    await root().post('/api/v1/inventory/receive', {
      branchId: ids.branch,
      lines: [{ variantId: ids.variant, qty: 20 }],
    }),
    201,
  );
});

describe('moving an order along', () => {
  it('walks the happy path and records who moved it and when', async () => {
    const order = await placeOrder();
    await ok(await move(order.id, 'cod_confirmed'));
    await ok(await move(order.id, 'processing'));
    await ok(
      await root().post(`${ORDERS}/${order.id}/shipments`, {
        carrier: 'Aramex',
        trackingNumber: 'ARX-123456',
      }),
      200,
    );
    expect(await statusOf(order.id)).toBe('shipped'); // the tracking number ships it

    await ok(await move(order.id, 'delivered'));
    const done = await ok(await move(order.id, 'completed'));

    expect(done.status).toBe('completed');
    expect(done.statusHistory.map((h) => h.to)).toEqual([
      'cod_confirmed',
      'processing',
      'shipped',
      'delivered',
      'completed',
    ]);
    expect(done.statusHistory.every((h) => h.by === 'staff' && h.staffId)).toBe(true);
    expect(done.shipments[0]).toMatchObject({ carrier: 'Aramex', trackingNumber: 'ARX-123456' });
    expect(done.nextActions).toEqual([]); // nothing left for the shop to do
    await waitFor(async () => events.some((e) => e.name === EVENTS.ORDER_COMPLETED));
  });

  it('refuses a move the flow does not describe', async () => {
    const order = await placeOrder();
    const res = await move(order.id, 'delivered');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await statusOf(order.id)).toBe('pending');
  });

  it('will not ship an order that has no shipment yet', async () => {
    const order = await placeOrder();
    await ok(await move(order.id, 'cod_confirmed'));
    await ok(await move(order.id, 'processing'));
    const res = await move(order.id, 'shipped');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/shipment/i);
  });

  it('tells the admin what it may do next, and why something is blocked', async () => {
    const order = await placeOrder();
    await ok(await move(order.id, 'cod_confirmed'));
    const detail = await ok(await root().get(`${ORDERS}/${order.id}`));
    const ship = detail.nextActions.find((a) => a.action === 'ship');
    expect(detail.nextActions.map((a) => a.action)).toEqual(['startProcessing', 'cancel']);
    expect(ship).toBeUndefined();

    await ok(await move(order.id, 'processing'));
    const next = await ok(await root().get(`${ORDERS}/${order.id}`));
    expect(next.nextActions.find((a) => a.action === 'ship').blockedBy).toMatch(/shipment/i);
  });

  it('only confirms cash on delivery for a cash order', async () => {
    const order = await placeOrder();
    await Order.updateOne({ _id: order.id }, { $set: { 'payment.methodType': 'gateway' } });
    const res = await move(order.id, 'cod_confirmed');
    expect(res.status).toBe(409);
  });
});

describe('calling an order off', () => {
  it('puts the goods back on the shelf and says so', async () => {
    const before = await onHand();
    const order = await placeOrder();
    expect(await onHand()).toBe(before - 2);

    const cancelled = await ok(
      await move(order.id, 'cancelled', { reason: 'Customer changed mind' }),
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason).toBe('Customer changed mind');
    expect(await onHand()).toBe(before);
    expect(cancelled.statusHistory.at(-1)).toMatchObject({ to: 'cancelled', restocked: true });

    const event = await waitFor(async () =>
      events.find((e) => e.name === EVENTS.ORDER_CANCELLED && e.orderId === order.id),
    );
    expect(event).toMatchObject({ restocked: true, reason: 'Customer changed mind' });
  });

  it('restocks exactly once, even if the cancel is sent twice', async () => {
    const before = await onHand();
    const order = await placeOrder();
    await ok(await move(order.id, 'cancelled'));
    const again = await move(order.id, 'cancelled');
    expect(again.status).toBe(200); // already there: nothing changes
    expect(await onHand()).toBe(before);
  });

  it('refuses to cancel a paid order until the money is returned', async () => {
    const order = await placeOrder();
    await Order.updateOne(
      { _id: order.id },
      { $set: { 'payment.status': 'paid', status: 'paid' } },
    );
    const res = await move(order.id, 'cancelled');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/refund/i);

    await Order.updateOne({ _id: order.id }, { $set: { 'payment.status': 'refunded' } });
    expect((await move(order.id, 'cancelled')).status).toBe(200);
  });

  it('is too late once the parcel has gone', async () => {
    const order = await placeOrder();
    await ok(await move(order.id, 'cod_confirmed'));
    await ok(await move(order.id, 'processing'));
    await ok(await root().post(`${ORDERS}/${order.id}/shipments`, { carrier: 'Aramex' }));
    expect((await move(order.id, 'cancelled')).status).toBe(409);
  });
});

describe('who may do what', () => {
  it('needs order.cancel to call an order off, and order.update for the rest', async () => {
    const order = await placeOrder();
    const role = await ok(
      await root().post('/api/v1/roles', {
        name: 'Order clerk',
        permissions: ['order.view', 'order.update'],
      }),
      201,
    );
    await createStaff(
      { name: 'Clerk One', email: 'clerk@shop.test', password: 'clerk-pass-123', roleId: role.id },
      { actor: null },
    ).catch(async () => {
      await ok(
        await root().post('/api/v1/staff', {
          name: 'Clerk One',
          email: 'clerk@shop.test',
          password: 'clerk-pass-123',
          roleId: role.id,
        }),
        201,
      );
    });
    const clerk = as(
      (
        await request(app)
          .post('/api/v1/auth/staff/login')
          .send({ email: 'clerk@shop.test', password: 'clerk-pass-123' })
      ).body.data.accessToken,
    );

    expect(
      (await clerk.post(`${ORDERS}/${order.id}/transitions`, { to: 'cod_confirmed' })).status,
    ).toBe(200);
    expect(
      (await clerk.post(`${ORDERS}/${order.id}/transitions`, { to: 'cancelled' })).status,
    ).toBe(403);
    expect((await move(order.id, 'cancelled')).status).toBe(200); // the super-admin may
  });

  it('keeps the shop’s orders away from customers and strangers', async () => {
    const order = await placeOrder();
    expect((await request(app).get(ORDERS)).status).toBe(401);
    expect(
      (await request(app).post(`${ORDERS}/${order.id}/transitions`).send({ to: 'processing' }))
        .status,
    ).toBe(401);
    const cashierToken = await (async () => {
      await ok(
        await root().post('/api/v1/staff', {
          name: 'Cashier One',
          email: 'cashier@shop.test',
          password: 'cashier-pass-123',
          roleId: String(await findSystemRoleId('cashier')),
        }),
        201,
      );
      return (
        await request(app)
          .post('/api/v1/auth/staff/login')
          .send({ email: 'cashier@shop.test', password: 'cashier-pass-123' })
      ).body.data.accessToken;
    })();
    expect(
      (await as(cashierToken).post(`${ORDERS}/${order.id}/transitions`, { to: 'processing' }))
        .status,
    ).toBe(403);
  });
});

describe('the orders list', () => {
  it('filters by status and finds an order by its number or phone', async () => {
    const first = await placeOrder();
    const second = await placeOrder();
    await ok(await move(second.id, 'cancelled'));

    const open = await root().get(`${ORDERS}?status=pending`);
    expect(open.body.data.map((o) => o.orderNo)).toEqual([first.orderNo]);
    expect(open.body.meta).toMatchObject({ page: 1, total: 1 });

    const byNumber = await root().get(`${ORDERS}?q=${second.orderNo}`);
    expect(byNumber.body.data[0]).toMatchObject({ orderNo: second.orderNo, status: 'cancelled' });

    const byPhone = await root().get(`${ORDERS}?q=0512345678`);
    expect(byPhone.body.data).toHaveLength(2);
  });
});
