import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { csrfHeaders, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { Cart } from '../../cart/cart.model.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Payment } from '../payment.model.js';
import { resetGatewayCache } from '../payment.service.js';

/** P4.1 — COD, the hosted gateway flow, webhooks and refunds. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const WEBHOOK_SECRET = 'whsec-test-123';
const FORM = {
  contact: { name: 'Sara Ali', phone: '0512345678', email: 'sara@example.com' },
  address: { city: 'Riyadh', line1: 'King Fahd Rd, Building 12', postalCode: '12345' },
};

let app;
let rootToken;
const ids = {};
const events = [];
const offs = [];

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
};

/** Moyasar's hosted-invoice API, as far as this flow uses it. */
const gatewayStub = ({ invoiceStatus = 'initiated', failRefund = false } = {}) => {
  const calls = [];
  let created = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const u = String(url);
      calls.push({
        url: u,
        method: init?.method ?? 'GET',
        body: init?.body && JSON.parse(init.body),
      });
      const json = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      if (u.endsWith('/invoices') && init?.method === 'POST') {
        created += 1;
        // A freshly created invoice is never paid yet — only a later read or a webhook says so.
        return json({
          id: `inv_${created}`,
          status: 'initiated',
          amount: JSON.parse(init.body).amount,
          url: `https://pay.example.test/inv_${created}`,
        });
      }
      if (u.includes('/invoices/inv_1'))
        return json({
          id: 'inv_1',
          status: invoiceStatus,
          amount: 23000,
          url: 'https://pay.example.test/inv_1',
          payments: [{ id: 'pay_1', status: invoiceStatus === 'paid' ? 'paid' : 'initiated' }],
        });
      if (u.includes('/payments/pay_1/refund'))
        return failRefund
          ? json({ message: 'refund refused' }, 400)
          : json({
              id: 'ref_1',
              status: 'refunded',
              refunded: JSON.parse(init.body ?? '{}').amount ?? 23000,
            });
      return json({ message: 'unexpected' }, 404);
    }),
  );
  return calls;
};

/** Keys in settings + the "card" method switched on, which is what a shop actually does. */
const enableGateway = async () => {
  const methods = await ok(await root.get('/api/v1/payment-methods'));
  const card = methods.find((m) => m.key === 'card');
  await ok(await root.patch(`/api/v1/payment-methods/${card.id}`, { enabled: true }));
  return ok(
    await root.patch('/api/v1/settings', {
      changes: [
        { key: 'payments.gateway', value: 'moyasar' },
        { key: 'payments.moyasar.secretKey', value: 'sk_test_123' },
        { key: 'payments.moyasar.webhookSecret', value: WEBHOOK_SECRET },
      ],
    }),
  );
};

/** A shopper with a cart cookie, like the storefront. */
const shopper = () => {
  const agent = request.agent(app);
  return {
    add: (qty = 2) =>
      agent.post('/api/v1/cart/items').set(csrfHeaders).send({ variantId: ids.variant, qty }),
    place: (paymentMethod) =>
      agent
        .post('/api/v1/checkout?lang=en')
        .set(csrfHeaders)
        .set('Idempotency-Key', `key-${Math.random()}`)
        .send({ ...FORM, paymentMethod }),
  };
};
const webhook = (body) => request(app).post('/api/v1/payments/webhook/moyasar').send(body);

beforeEach(async () => {
  events.length = 0;
  resetGatewayCache();
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Cart.init(), Order.init(), Payment.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

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
      lines: [{ variantId: ids.variant, qty: 20 }],
    }),
    201,
  );
});

beforeAll(() => {
  for (const name of [
    EVENTS.PAYMENT_SUCCEEDED,
    EVENTS.PAYMENT_FAILED,
    EVENTS.PAYMENT_REFUNDED,
    EVENTS.ORDER_PAID,
  ])
    offs.push(eventBus.on(name, (e) => events.push({ name: e.name, ...e.payload })));
});
afterAll(() => offs.forEach((off) => off()));
afterEach(() => vi.unstubAllGlobals());

describe('payment methods', () => {
  it('offers cash only until a gateway is configured', async () => {
    const keys = async () =>
      (await ok(await request(app).get('/api/v1/payment-methods/public'))).map((m) => m.key);
    expect(await keys()).toEqual(['cod']);
    await enableGateway();
    gatewayStub();
    expect(await keys()).toEqual(['cod', 'card']);
  });

  it('refuses a card order while the gateway is off — no order, no stock taken', async () => {
    const s = shopper();
    await ok(await s.add());
    const res = await s.place('card');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('paymentMethod');
    expect(await Order.countDocuments({})).toBe(0);
    expect(await Payment.countDocuments({})).toBe(0);
  });
});

describe('cash on delivery', () => {
  it('records a pending cash payment and leaves the order pending', async () => {
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('cod'), 201);
    const payment = await waitFor(async () => Payment.findOne({ orderNo: order.orderNo }).lean());
    expect(payment).toMatchObject({
      provider: 'cod',
      method: 'cod',
      status: 'pending',
      amount: order.totals.total,
    });
    expect((await Order.findById(order.id).lean()).status).toBe('pending');
  });
});

describe('paying by card', () => {
  it('creates a hosted payment page and sends the customer to it', async () => {
    await enableGateway();
    const calls = gatewayStub();
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);

    expect(order.payment).toMatchObject({
      method: 'card',
      redirectUrl: 'https://pay.example.test/inv_1',
    });
    const created = calls.find((c) => c.method === 'POST' && c.url.endsWith('/invoices'));
    expect(created.body).toMatchObject({ amount: order.totals.total, currency: 'SAR' });
    expect(created.body.callback_url).toContain('/checkout/confirmation?token=');
    expect(created.body.metadata).toMatchObject({ orderNo: order.orderNo });

    const payment = await Payment.findOne({ orderNo: order.orderNo }).lean();
    expect(payment).toMatchObject({ provider: 'moyasar', status: 'pending', gatewayRef: 'inv_1' });
  });

  it('marks the order paid when the webhook arrives, and ignores a repeat of it', async () => {
    await enableGateway();
    gatewayStub();
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);

    const event = {
      id: 'evt_1',
      type: 'invoice_paid',
      secret_token: WEBHOOK_SECRET,
      data: {
        id: 'inv_1',
        status: 'paid',
        amount: order.totals.total,
        payments: [{ id: 'pay_1' }],
      },
    };
    expect(await ok(await webhook(event))).toEqual({ applied: true });

    const paid = await Order.findById(order.id).lean();
    expect(paid.status).toBe('paid');
    expect(paid.payment).toMatchObject({ status: 'paid', gatewayRef: 'inv_1' });
    expect(events.filter((e) => e.name === EVENTS.PAYMENT_SUCCEEDED)).toHaveLength(1);
    await waitFor(async () => events.some((e) => e.name === EVENTS.ORDER_PAID));

    // The same delivery again changes nothing.
    expect(await ok(await webhook(event))).toEqual({ applied: true });
    expect(events.filter((e) => e.name === EVENTS.PAYMENT_SUCCEEDED)).toHaveLength(1);
    const payment = await Payment.findOne({ gatewayRef: 'inv_1' }).lean();
    expect(payment.processedEvents).toEqual(['evt_1']);
  });

  it('refuses a webhook with the wrong secret and ignores one for an unknown payment', async () => {
    await enableGateway();
    gatewayStub();
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);

    const forged = await webhook({
      id: 'evt_2',
      type: 'invoice_paid',
      secret_token: 'not-the-secret',
      data: { id: 'inv_1', status: 'paid', amount: order.totals.total },
    });
    expect(forged.status).toBe(401);
    expect((await Order.findById(order.id).lean()).status).toBe('pending');

    const stranger = await webhook({
      id: 'evt_3',
      type: 'invoice_paid',
      secret_token: WEBHOOK_SECRET,
      data: { id: 'inv_elsewhere', status: 'paid', amount: 100 },
    });
    expect(await ok(stranger)).toEqual({ applied: false });
  });

  it('never marks an order paid for a different amount', async () => {
    await enableGateway();
    gatewayStub();
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);

    const res = await webhook({
      id: 'evt_4',
      type: 'invoice_paid',
      secret_token: WEBHOOK_SECRET,
      data: { id: 'inv_1', status: 'paid', amount: 100 },
    });
    expect(res.status).toBe(409);
    expect((await Order.findById(order.id).lean()).status).toBe('pending');
  });

  it('catches up from the gateway when the customer comes back before the webhook', async () => {
    await enableGateway();
    gatewayStub({ invoiceStatus: 'paid' });
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);
    expect((await Order.findById(order.id).lean()).status).toBe('pending');

    const seen = await ok(
      await request(app).get(
        `/api/v1/checkout/confirmation?token=${encodeURIComponent(order.confirmationToken)}`,
      ),
    );
    expect(seen.payment?.status ?? (await Order.findById(order.id).lean()).payment.status).toBe(
      'paid',
    );
    expect((await Order.findById(order.id).lean()).status).toBe('paid');
  });

  it('issues a new payment page when the customer asks to try again', async () => {
    await enableGateway();
    gatewayStub();
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);
    const retry = await ok(
      await request(app)
        .post('/api/v1/payments/retry')
        .set(csrfHeaders)
        .send({ token: order.confirmationToken }),
    );
    expect(retry.redirectUrl).toBe('https://pay.example.test/inv_2');
  });
});

describe('refunds', () => {
  const payOrder = async () => {
    const s = shopper();
    await ok(await s.add());
    const order = await ok(await s.place('card'), 201);
    await ok(
      await webhook({
        id: 'evt_pay',
        type: 'invoice_paid',
        secret_token: WEBHOOK_SECRET,
        data: {
          id: 'inv_1',
          status: 'paid',
          amount: order.totals.total,
          payments: [{ id: 'pay_1' }],
        },
      }),
    );
    return { order, payment: await Payment.findOne({ gatewayRef: 'inv_1' }).lean() };
  };

  it('refunds part and then the rest, and closes the order when nothing is left', async () => {
    await enableGateway();
    gatewayStub({ invoiceStatus: 'paid' });
    const { order, payment } = await payOrder();

    const part = await ok(
      await root.post(`/api/v1/payments/${payment._id}/refund`, { amount: 3000 }),
    );
    expect(part).toMatchObject({ status: 'paid', refundedAmount: 3000 });
    expect((await Order.findById(order.id).lean()).status).toBe('paid');

    const rest = await ok(await root.post(`/api/v1/payments/${payment._id}/refund`, {}));
    expect(rest).toMatchObject({ status: 'refunded', refundedAmount: order.totals.total });
    expect((await Order.findById(order.id).lean()).status).toBe('refunded');
    expect(events.filter((e) => e.name === EVENTS.PAYMENT_REFUNDED)).toHaveLength(2);
  });

  it('refuses more than is left, an unpaid payment, and staff without the permission', async () => {
    await enableGateway();
    gatewayStub({ invoiceStatus: 'paid' });
    const { payment } = await payOrder();

    expect(
      (await root.post(`/api/v1/payments/${payment._id}/refund`, { amount: 999_999 })).status,
    ).toBe(400);

    const cashier = await ok(
      await root.post('/api/v1/staff', {
        name: 'Cashier One',
        email: 'cashier@shop.test',
        password: 'cashier-pass-123',
        roleId: String(await findSystemRoleId('cashier')),
      }),
      201,
    );
    expect(cashier.id).toBeTruthy();
    const cashierToken = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'cashier@shop.test', password: 'cashier-pass-123' })
    ).body.data.accessToken;
    expect(
      (
        await request(app)
          .post(`/api/v1/payments/${payment._id}/refund`)
          .set('Authorization', `Bearer ${cashierToken}`)
          .send({})
      ).status,
    ).toBe(403);
  });
});
