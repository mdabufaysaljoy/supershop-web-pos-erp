import { EVENTS, PRINCIPAL_TYPES } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { csrfHeaders, nextEvent, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { Cart } from '../../cart/cart.model.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { NotificationLog, NotificationTemplate } from '../notification.model.js';
import {
  render,
  resetProviderCache,
  seedNotificationTemplates,
  sendNotification,
} from '../index.js';

/** P4.5 — what the shop sends, in the customer's language, and what it writes down about it. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const BASE = '/api/v1/notifications';
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
};
const logs = () => NotificationLog.find({}).sort({ createdAt: 1 }).lean();

beforeEach(async () => {
  resetProviderCache();
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Cart.init(), Order.init(), NotificationTemplate.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await seedNotificationTemplates();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

afterEach(() => vi.unstubAllGlobals());

describe('templates', () => {
  it('seeds the shop’s messages once and lists them', async () => {
    await seedNotificationTemplates();
    const templates = await ok(await root.get(`${BASE}/templates`));
    expect(templates.length).toBeGreaterThanOrEqual(8);
    expect(templates.find((t) => t.key === 'order.shipped.sms')).toMatchObject({
      channel: 'sms',
      event: 'order.shipped',
      builtIn: true,
      enabled: true,
    });
    expect(templates.every((t) => t.subject.en !== undefined || t.channel === 'sms')).toBe(true);
  });

  it('rewords one and switches another off', async () => {
    const templates = await ok(await root.get(`${BASE}/templates`));
    const placed = templates.find((t) => t.key === 'order.placed.email');
    const reworded = await ok(
      await root.patch(`${BASE}/templates/${placed.id}`, {
        subject: 'We have your order {{order.number}}',
      }),
    );
    expect(reworded.subject.en).toBe('We have your order {{order.number}}');

    const sms = templates.find((t) => t.key === 'order.placed.sms');
    expect(
      (await ok(await root.patch(`${BASE}/templates/${sms.id}`, { enabled: false }))).enabled,
    ).toBe(false);
    expect((await root.patch(`${BASE}/templates/${sms.id}`, {})).status).toBe(400);
  });

  it('needs settings.notifications', async () => {
    expect((await request(app).get(`${BASE}/templates`)).status).toBe(401);
  });
});

describe('rendering', () => {
  it('fills in the variables it knows and leaves nothing dangling', () => {
    const vars = { store: { name: 'Supershop' }, order: { number: 'ORD-1' } };
    expect(render('{{store.name}}: order {{order.number}}', vars)).toBe('Supershop: order ORD-1');
    expect(render('Hello {{customer.name}}!', vars)).toBe('Hello !');
    expect(render('No variables here', vars)).toBe('No variables here');
  });
});

describe('sending', () => {
  const sendOrderPlaced = (over = {}) =>
    sendNotification({
      event: 'order.placed',
      channel: 'email',
      to: 'sara@example.com',
      lang: 'en',
      vars: {
        store: { name: 'Supershop' },
        customer: { name: 'Sara Ali' },
        order: { number: 'ORD-000007', total: 'SAR 253.00', trackUrl: 'https://shop.test/track' },
      },
      ...over,
    });

  it('writes down what it sent, to whom and in which language', async () => {
    expect(await sendOrderPlaced()).toMatchObject({ status: 'sent' });
    const [entry] = await logs();
    expect(entry).toMatchObject({
      channel: 'email',
      event: 'order.placed',
      to: 'sara@example.com',
      status: 'sent',
      provider: 'log',
      lang: 'en',
    });
    expect(entry.subject).toBe('Your Supershop order ORD-000007');
    expect(entry.body).toContain('ORD-000007');
    expect(entry.body).toContain('SAR 253.00');
  });

  it('sends nothing when the channel is off, the template is off, or there is no recipient', async () => {
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [{ key: 'notifications.email', value: false }],
      }),
    );
    expect(await sendOrderPlaced()).toMatchObject({ status: 'skipped', reason: 'channel-off' });

    await ok(
      await root.patch('/api/v1/settings', {
        changes: [{ key: 'notifications.email', value: true }],
      }),
    );
    const templates = await ok(await root.get(`${BASE}/templates`));
    const placed = templates.find((t) => t.key === 'order.placed.email');
    await ok(await root.patch(`${BASE}/templates/${placed.id}`, { enabled: false }));
    expect(await sendOrderPlaced()).toMatchObject({ status: 'skipped', reason: 'no-template' });

    expect(await sendOrderPlaced({ to: '' })).toMatchObject({ status: 'skipped' });
    expect(await logs()).toHaveLength(0); // nothing was sent, so nothing is claimed
  });

  it('records a failure and lets the queue retry it', async () => {
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [
          { key: 'notifications.sms', value: true },
          { key: 'notifications.smsProvider', value: 'taqnyat' },
          { key: 'notifications.smsSender', value: 'Supershop' },
          { key: 'notifications.smsApiKey', value: 'tok-123' },
        ],
      }),
    );
    resetProviderCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'quota' }), { status: 402 })),
    );
    await expect(
      sendNotification({
        event: 'order.shipped',
        channel: 'sms',
        to: '+966512345678',
        lang: 'en',
        vars: {
          store: { name: 'Supershop' },
          order: { number: 'ORD-1' },
          shipment: { carrier: 'Aramex', trackingNumber: 'X1' },
        },
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    const [entry] = await logs();
    expect(entry).toMatchObject({ status: 'failed', channel: 'sms', provider: 'taqnyat' });
    expect(entry.error).toContain('quota');
  });

  it('asks the provider in the shape it documents', async () => {
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [
          { key: 'notifications.sms', value: true },
          { key: 'notifications.smsProvider', value: 'unifonic' },
          { key: 'notifications.smsSender', value: 'Supershop' },
          { key: 'notifications.smsApiKey', value: 'app-sid-1' },
        ],
      }),
    );
    resetProviderCache();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: 'true', data: { MessageID: 7 } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await sendNotification({
      event: 'order.shipped',
      channel: 'sms',
      to: '+966512345678',
      lang: 'en',
      vars: {
        store: { name: 'Supershop' },
        order: { number: 'ORD-1' },
        shipment: { carrier: 'Aramex', trackingNumber: 'X1' },
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('unifonic.com');
    const body = new URLSearchParams(init.body);
    expect(body.get('Recipient')).toBe('966512345678'); // no "+"
    expect(body.get('AppSid')).toBe('app-sid-1');
    expect(body.get('Body')).toContain('Aramex');
  });
});

describe('the shop’s own test message', () => {
  it('sends one and records it', async () => {
    const result = await ok(
      await root.post(`${BASE}/test`, { channel: 'email', to: 'owner@shop.test' }),
    );
    expect(result).toMatchObject({ status: 'sent' });
    const [entry] = await logs();
    expect(entry).toMatchObject({ event: 'test', to: 'owner@shop.test', status: 'sent' });
    expect((await ok(await root.get(`${BASE}/logs`))).length).toBe(1);
  });

  it('refuses an address that is not one', async () => {
    expect((await root.post(`${BASE}/test`, { channel: 'email', to: 'nope' })).status).toBe(400);
    expect((await root.post(`${BASE}/test`, { channel: 'sms', to: '123' })).status).toBe(400);
  });
});

describe('what the shop says when something happens', () => {
  /** A real order, so the subscribers run against the real events. */
  const placeOrder = async () => {
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
    return ok(
      await agent
        .post('/api/v1/checkout?lang=en')
        .set(csrfHeaders)
        .set('Idempotency-Key', `k-${Math.random()}`)
        .send({
          contact: { name: 'Sara Ali', phone: '0512345678', email: 'sara@example.com' },
          address: { city: 'Riyadh', line1: 'King Fahd Rd 12' },
          paymentMethod: 'cod',
        }),
      201,
    );
  };

  it('tells the customer their order was placed, in the order’s language', async () => {
    const order = await placeOrder();
    // The worker is not running in tests: the subscriber's job data is what matters, so send it here.
    const sent = await sendNotification({
      event: 'order.placed',
      channel: 'email',
      to: 'sara@example.com',
      lang: order.lang,
      vars: {
        store: { name: 'Supershop' },
        customer: { name: order.customer.name },
        order: { number: order.orderNo, total: 'SAR 230.00', trackUrl: 'https://shop.test/track' },
      },
      orderId: order.id,
    });
    expect(sent.status).toBe('sent');
    const [entry] = await logs();
    expect(entry.body).toContain(order.orderNo);
    expect(String(entry.orderId)).toBe(order.id);
  });

  it('keeps the one-time token out of the log it writes', async () => {
    const verification = nextEvent(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED);
    await ok(
      await request(app).post('/api/v1/customers/register').send({
        name: 'Sara Ali',
        email: 'sara@example.com',
        password: 'my-secret-pass-1',
      }),
      201,
    );
    const { token, principalType } = (await verification).payload;
    expect(principalType).toBe(PRINCIPAL_TYPES.CUSTOMER);

    await sendNotification({
      event: 'auth.verifyEmail',
      channel: 'email',
      to: 'sara@example.com',
      lang: 'en',
      vars: {
        store: { name: 'Supershop' },
        customer: { name: 'Sara Ali' },
        link: `https://shop.test/account/verify-email?token=${token}`,
      },
    });
    const entry = await waitFor(async () => (await logs())[0]);
    // The link (with its token) is in the message the customer gets…
    expect(entry.body).toContain(token);
    // …and the audit/event stream never carries the rendered body.
    expect(entry.event).toBe('auth.verifyEmail');
  });
});

describe('events', () => {
  it('announces a message that went out', async () => {
    const seen = nextEvent(EVENTS.NOTIFICATION_SENT);
    await sendNotification({
      event: 'order.paid',
      channel: 'email',
      to: 'sara@example.com',
      lang: 'en',
      vars: {
        store: { name: 'Supershop' },
        customer: { name: 'Sara' },
        order: { number: 'ORD-1', total: 'SAR 1.00' },
      },
    });
    expect((await seen).payload).toMatchObject({ event: 'order.paid', channel: 'email' });
  });
});
