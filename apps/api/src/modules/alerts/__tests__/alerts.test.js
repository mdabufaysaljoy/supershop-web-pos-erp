import { EVENTS, PERMISSIONS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Alert } from '../alert.model.js';
import { raiseAlert, setAllPermissions } from '../alert.service.js';

/** The bell in the admin: what a shop is told, and who is told it. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
let rootToken;
let cashierToken;

const login = async (email) => {
  const res = await request(app)
    .post('/api/v1/auth/staff/login')
    .set('X-CSRF-Protection', '1')
    .send({ email, password: PW });
  return res.body.data.accessToken;
};
const as = (token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url, body) =>
    request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Protection', '1')
      .send(body),
});
const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

beforeEach(async () => {
  app = createApp();
  await loadSettings();
  await seedDefaultRoles();
  setAllPermissions([...Object.values(PERMISSIONS)]);
  await Alert.init();
  await ensureSuperAdmin({ name: 'Root', email: 'root@shop.test', password: PW });
  rootToken = await login('root@shop.test');

  // Somebody who sells but may not look at orders.
  const role = await ok(
    await as(rootToken).post('/api/v1/roles', { name: 'Till only', permissions: ['pos.sell'] }),
    201,
  );
  await ok(
    await as(rootToken).post('/api/v1/staff', {
      name: 'Cara',
      email: 'cara@shop.test',
      password: PW,
      roleId: role.id,
    }),
    201,
  );
  cashierToken = await login('cara@shop.test');
});

describe('the bell', () => {
  it('tells the shop about a sale on the website, with somewhere to go', async () => {
    eventBus.emit(EVENTS.ORDER_CREATED, {
      orderId: '64f000000000000000000001',
      orderNo: 'ORD-000042',
      channel: 'online',
      total: 45_000,
      itemCount: 2,
    });
    await new Promise((r) => setTimeout(r, 50));

    const feed = await ok(await as(rootToken).get('/api/v1/alerts'));
    expect(feed.unread).toBe(1);
    expect(feed.items[0]).toMatchObject({
      type: 'order.online',
      title: 'New online order ORD-000042',
      link: '/orders/64f000000000000000000001',
      read: false,
    });
    expect(feed.items[0].body).toContain('2 items');
  });

  it('says nothing to someone who could not open it anyway', async () => {
    await raiseAlert({
      type: 'order.online',
      title: 'New online order ORD-000043',
      link: '/orders/x',
      permission: PERMISSIONS.ORDER_VIEW,
    });
    // A notice with no permission on it is for everyone.
    await raiseAlert({ type: 'shop.notice', title: 'The shop is open' });

    const cashier = await ok(await as(cashierToken).get('/api/v1/alerts'));
    expect(cashier.items.map((a) => a.title)).toEqual(['The shop is open']);
    const root = await ok(await as(rootToken).get('/api/v1/alerts'));
    expect(root.items).toHaveLength(2);
  });

  it('is read per person: marking mine read leaves yours unread', async () => {
    await raiseAlert({ type: 'shop.notice', title: 'The shop is open' });

    await as(rootToken).post('/api/v1/alerts/read', {});
    expect((await ok(await as(rootToken).get('/api/v1/alerts'))).unread).toBe(0);
    expect((await ok(await as(cashierToken).get('/api/v1/alerts'))).unread).toBe(1);
  });

  it('needs an account, like everything else in the admin', async () => {
    expect((await request(app).get('/api/v1/alerts')).status).toBe(401);
  });
});
