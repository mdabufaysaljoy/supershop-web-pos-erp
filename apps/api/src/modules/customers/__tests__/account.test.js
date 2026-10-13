import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { csrfHeaders, nextEvent, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { Cart } from '../../cart/cart.model.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';

/** P3.5 — customer account: profile, address book, order history, Google sign-in. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const ACCOUNT = '/api/v1/account';
const ADDRESS = { city: 'Riyadh', line1: 'King Fahd Rd, Building 12', postalCode: '12345' };

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

/** A signed-in customer's browser. */
const as = (token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${token}`).set(csrfHeaders).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${token}`).set(csrfHeaders).send(body),
  del: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`).set(csrfHeaders),
});

const register = async (over = {}) => {
  const body = {
    name: 'Sara Ali',
    email: 'sara@example.com',
    phone: '0512345678',
    password: 'my-secret-pass-1',
    ...over,
  };
  const data = await ok(await request(app).post('/api/v1/customers/register').send(body), 201);
  return { token: data.accessToken, profile: data.profile, body };
};

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Cart.init(), Order.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

afterEach(() => vi.unstubAllGlobals());

describe('profile', () => {
  it('returns the signed-in customer with an empty address book', async () => {
    const { token } = await register();
    expect(await ok(await as(token).get(ACCOUNT))).toMatchObject({
      name: 'Sara Ali',
      email: 'sara@example.com',
      phone: '+966512345678',
      emailVerified: false,
      addresses: [],
    });
  });

  it('refuses anonymous callers', async () => {
    expect((await request(app).get(ACCOUNT)).status).toBe(401);
    expect((await request(app).patch(`${ACCOUNT}/profile`).set(csrfHeaders).send({})).status).toBe(
      401,
    );
  });

  it('updates name, phone and language and normalizes Arabic-Indic digits', async () => {
    const { token } = await register();
    const data = await ok(
      await as(token).patch(`${ACCOUNT}/profile`, {
        name: 'Sara A.',
        phone: '٠٥٠١١١٢٢٢٢',
        lang: 'ar',
      }),
    );
    expect(data).toMatchObject({ name: 'Sara A.', phone: '+966501112222', lang: 'ar' });
  });

  it('rejects an empty patch, a bad phone and the email (changed through verification only)', async () => {
    const { token } = await register();
    expect((await as(token).patch(`${ACCOUNT}/profile`, {})).status).toBe(400);
    expect((await as(token).patch(`${ACCOUNT}/profile`, { phone: 'abc' })).status).toBe(400);
    expect(
      (await as(token).patch(`${ACCOUNT}/profile`, { email: 'other@example.com' })).status,
    ).toBe(400);
  });

  it('409s when another account already uses the phone', async () => {
    await register({ email: 'first@example.com', phone: '0500000001' });
    const { token } = await register({ email: 'second@example.com', phone: '0500000002' });
    const res = await as(token).patch(`${ACCOUNT}/profile`, { phone: '0500000001' });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toMatchObject({ fields: ['phone'] });
  });
});

describe('address book', () => {
  it('makes the first address the default and keeps exactly one', async () => {
    const { token } = await register();
    const first = await ok(await as(token).post(`${ACCOUNT}/addresses`, { address: ADDRESS }), 201);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ isDefault: true, label: null });

    const second = await ok(
      await as(token).post(`${ACCOUNT}/addresses`, {
        label: 'Work',
        address: { ...ADDRESS, line1: 'Olaya St 7' },
        isDefault: true,
      }),
      201,
    );
    expect(second.map((a) => a.isDefault)).toEqual([false, true]);
  });

  it('updates an address and moves the default', async () => {
    const { token } = await register();
    await ok(await as(token).post(`${ACCOUNT}/addresses`, { address: ADDRESS }), 201);
    const [a, b] = await ok(
      await as(token).post(`${ACCOUNT}/addresses`, {
        address: { ...ADDRESS, line1: 'Olaya St 7' },
      }),
      201,
    );
    expect(a.isDefault).toBe(true);
    const updated = await ok(
      await as(token).patch(`${ACCOUNT}/addresses/${b.id}`, { label: 'Work', isDefault: true }),
    );
    expect(updated[1]).toMatchObject({ label: 'Work', isDefault: true });
    expect(updated[0].isDefault).toBe(false);
  });

  it('promotes another address when the default is deleted', async () => {
    const { token } = await register();
    const [first] = await ok(
      await as(token).post(`${ACCOUNT}/addresses`, { address: ADDRESS }),
      201,
    );
    await ok(
      await as(token).post(`${ACCOUNT}/addresses`, {
        address: { ...ADDRESS, line1: 'Olaya St 7' },
      }),
      201,
    );
    const left = await ok(await as(token).del(`${ACCOUNT}/addresses/${first.id}`));
    expect(left).toHaveLength(1);
    expect(left[0].isDefault).toBe(true);
  });

  it('validates the address and refuses someone else’s id', async () => {
    const { token } = await register();
    expect(
      (await as(token).post(`${ACCOUNT}/addresses`, { address: { city: 'R', line1: 'x' } })).status,
    ).toBe(400);
    const other = await register({ email: 'other@example.com', phone: '0500000009' });
    const [theirs] = await ok(
      await as(other.token).post(`${ACCOUNT}/addresses`, { address: ADDRESS }),
      201,
    );
    expect(
      (await as(token).patch(`${ACCOUNT}/addresses/${theirs.id}`, { label: 'x' })).status,
    ).toBe(404);
    expect((await as(token).del(`${ACCOUNT}/addresses/${theirs.id}`)).status).toBe(404);
  });

  it('stops at the maximum number of addresses', async () => {
    const { token } = await register();
    for (let i = 0; i < 10; i += 1) {
      await ok(
        await as(token).post(`${ACCOUNT}/addresses`, {
          address: { ...ADDRESS, line1: `Street ${i}` },
        }),
        201,
      );
    }
    const res = await as(token).post(`${ACCOUNT}/addresses`, { address: ADDRESS });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toBe('validation.tooMany');
  });
});

describe('order history', () => {
  const FORM = {
    contact: { name: 'Sara Ali', phone: '0512345678', email: 'sara@example.com' },
    address: ADDRESS,
    paymentMethod: 'cod',
  };

  /** A sellable product in a branch that fulfils online orders. */
  const seedCatalog = async () => {
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
  };

  it('lists the orders a customer placed while signed in, and hides everyone else’s', async () => {
    await seedCatalog();
    const { token } = await register();
    const agent = request.agent(app);
    await ok(
      await agent
        .post('/api/v1/cart/items')
        .set(csrfHeaders)
        .set('Authorization', `Bearer ${token}`)
        .send({ variantId: ids.variant, qty: 2 }),
    );
    const order = await ok(
      await agent
        .post('/api/v1/checkout?lang=en')
        .set(csrfHeaders)
        .set('Authorization', `Bearer ${token}`)
        .send(FORM),
      201,
    );

    const res = await as(token).get(`${ACCOUNT}/orders`);
    expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
    expect(res.body.data[0]).toMatchObject({
      orderNo: order.orderNo,
      status: 'pending',
      itemCount: 2,
      total: order.totals.total,
    });
    expect(await ok(await as(token).get(`${ACCOUNT}/orders/${order.id}`))).toMatchObject({
      orderNo: order.orderNo,
      items: [{ sku: 'OX-1', qty: 2 }],
    });

    const stranger = await register({ email: 'nosy@example.com', phone: '0500000003' });
    expect((await as(stranger.token).get(`${ACCOUNT}/orders`)).body.data).toEqual([]);
    expect((await as(stranger.token).get(`${ACCOUNT}/orders/${order.id}`)).status).toBe(404);
  });

  it('adopts guest orders once the customer proves that email', async () => {
    await seedCatalog();
    const guest = request.agent(app);
    await ok(
      await guest
        .post('/api/v1/cart/items')
        .set(csrfHeaders)
        .send({ variantId: ids.variant, qty: 1 }),
    );
    const order = await ok(
      await guest.post('/api/v1/checkout?lang=en').set(csrfHeaders).send(FORM),
      201,
    );

    const verification = nextEvent(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED);
    const { token } = await register();
    // Not theirs until the email is proven — matching an address must never be enough.
    expect((await as(token).get(`${ACCOUNT}/orders`)).body.data).toEqual([]);

    await ok(
      await request(app)
        .post('/api/v1/auth/customer/email/verify')
        .send({ token: (await verification).payload.token }),
      204,
    );
    const linked = await waitFor(async () => {
      const list = (await as(token).get(`${ACCOUNT}/orders`)).body.data;
      return list.length ? list : null;
    });
    expect(linked[0]).toMatchObject({ orderNo: order.orderNo });
  });
});

describe('sign in with Google', () => {
  const START = '/api/v1/auth/customer/google/start';
  const CALLBACK = '/api/v1/auth/customer/google/callback';

  const enableGoogle = async () =>
    ok(
      await root.patch('/api/v1/settings', {
        changes: [
          { key: 'auth.google.enabled', value: true },
          { key: 'auth.google.clientId', value: 'client-123.apps.googleusercontent.com' },
          { key: 'auth.google.clientSecret', value: 'super-secret' },
        ],
      }),
    );

  /** Google's token + userinfo endpoints. */
  const stubGoogle = (profile) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        String(url).includes('token')
          ? new Response(JSON.stringify({ access_token: 'g-access' }), {
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify(profile), {
              headers: { 'Content-Type': 'application/json' },
            }),
      ),
    );

  it('404s while the provider is off', async () => {
    expect((await request(app).get(START)).status).toBe(404);
  });

  it('redirects to Google with a state cookie, then signs the customer in', async () => {
    await enableGoogle();
    const agent = request.agent(app);
    const started = await agent.get(`${START}?returnTo=/account/orders`);
    expect(started.status).toBe(302);
    const url = new URL(started.headers.location);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-123.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toMatch(
      /\/api\/v1\/auth\/customer\/google\/callback$/,
    );
    const state = url.searchParams.get('state');
    expect(state).toHaveLength(43);

    stubGoogle({ sub: 'g-1', email: 'Sara@Example.com', email_verified: true, name: 'Sara Ali' });
    const back = await agent.get(`${CALLBACK}?code=auth-code&state=${state}`);
    expect(back.status).toBe(302);
    expect(back.headers.location).toMatch(/\/account\/orders$/);
    expect(back.headers['set-cookie'].join()).toMatch(/ss_rt_customer=/);

    // The storefront turns the refresh cookie into an access token, as after any sign-in.
    const session = await ok(
      await agent.post('/api/v1/auth/customer/refresh').set(csrfHeaders).send(),
    );
    const me = await ok(
      await request(app).get(ACCOUNT).set('Authorization', `Bearer ${session.accessToken}`),
    );
    expect(me).toMatchObject({ email: 'sara@example.com', emailVerified: true });
  });

  it('links the identity to an existing account instead of creating a second one', async () => {
    await enableGoogle();
    const { profile } = await register();
    const agent = request.agent(app);
    const started = await agent.get(START);
    const state = new URL(started.headers.location).searchParams.get('state');
    stubGoogle({ sub: 'g-2', email: 'sara@example.com', email_verified: true, name: 'Sara' });
    await agent.get(`${CALLBACK}?code=c&state=${state}`);
    const session = await ok(
      await agent.post('/api/v1/auth/customer/refresh').set(csrfHeaders).send(),
    );
    const me = await ok(
      await request(app).get(ACCOUNT).set('Authorization', `Bearer ${session.accessToken}`),
    );
    expect(me.id).toBe(profile.id);
    expect(me.emailVerified).toBe(true);
  });

  it('refuses a mismatched state and an unverified email', async () => {
    await enableGoogle();
    const agent = request.agent(app);
    await agent.get(START);
    stubGoogle({ sub: 'g-3', email: 'sara@example.com', email_verified: true });
    const forged = await agent.get(`${CALLBACK}?code=c&state=not-the-state`);
    expect(forged.headers.location).toMatch(/\/account\/login\?error=signin$/);
    expect(forged.headers['set-cookie'].join()).not.toMatch(/ss_rt_customer=[^;]+;/);

    const second = request.agent(app);
    const state = new URL((await second.get(START)).headers.location).searchParams.get('state');
    stubGoogle({ sub: 'g-4', email: 'unverified@example.com', email_verified: false });
    const rejected = await second.get(`${CALLBACK}?code=c&state=${state}`);
    expect(rejected.headers.location).toMatch(/\/account\/login\?error=signin$/);
  });
});
