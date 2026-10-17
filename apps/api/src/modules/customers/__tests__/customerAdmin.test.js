import { CUSTOMER_SEGMENTS } from '@supershop/shared';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { LoyaltyAccount, LoyaltyLedger } from '../../loyalty/loyalty.model.js';
import { Order } from '../../orders/order.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { Customer } from '../customer.model.js';
import { registerCustomer } from '../customer.service.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'password-123';
let app;
const tokens = {};
let customerA;
let customerB;

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

const as = (who) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[who]}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
});

const loginStaff = async (email) =>
  (await request(app).post('/api/v1/auth/staff/login').send({ email, password: PW })).body.data
    .accessToken;

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Customer.init(), Order.init(), LoyaltyAccount.init(), LoyaltyLedger.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();

  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  tokens.root = await loginStaff('root@shop.test');

  const clerkRoleId = await findSystemRoleId('inventory_clerk');
  await createStaff(null, {
    name: 'Clerk Staff',
    email: 'clerk@shop.test',
    password: PW,
    roleId: clerkRoleId,
    branchIds: [],
  });
  tokens.clerk = await loginStaff('clerk@shop.test');

  // Register Customer A
  const regA = await registerCustomer({
    name: 'Lina Al-Mansour',
    email: 'lina@customer.test',
    phone: '+966501112233',
    password: PW,
  });
  customerA = regA.profile;

  // Register Customer B
  const regB = await registerCustomer({
    name: 'Sami Al-Ghamdi',
    email: 'sami@customer.test',
    phone: '+966504445566',
    password: PW,
  });
  customerB = regB.profile;

  // Create an order for Customer A (spend: 250,000 halalas = 2,500 SAR, VIP)
  await Order.create({
    orderNo: 'ORD-000001',
    channel: 'online',
    status: 'completed',
    lang: 'en',
    customer: {
      customerId: new mongoose.Types.ObjectId(customerA.id),
      name: customerA.name,
      phone: customerA.phone,
      email: customerA.email,
    },
    deliveryMethod: 'delivery',
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        variantId: new mongoose.Types.ObjectId(),
        sku: 'SKU-01',
        name: 'Coffee Machine Pro',
        unitPrice: 250_000,
        qty: 1,
        vatRateBps: 1500,
        lineTotal: 250_000,
        net: 217_391,
        vat: 32_609,
      },
    ],
    totals: {
      itemCount: 1,
      subtotal: 250_000,
      itemsTotal: 250_000,
      deliveryFee: 0,
      discountTotal: 0,
      net: 217_391,
      vat: 32_609,
      total: 250_000,
    },
    payment: { method: 'cod' },
    placedAt: new Date(),
  });

  // Loyalty account for Customer A
  await LoyaltyAccount.create({
    customerId: new mongoose.Types.ObjectId(customerA.id),
    pointsBalance: 25,
    lifetimeEarned: 25,
    lifetimeRedeemed: 0,
    tier: 'silver',
    status: 'active',
  });
});

describe('P7.2 Customer Admin API', () => {
  it('enforces RBAC permissions', async () => {
    // Unauthenticated
    const unauth = await request(app).get('/api/v1/customers');
    expect(unauth.status).toBe(401);

    // Inventory clerk role has no customer.view
    const forbidden = await as('clerk').get('/api/v1/customers');
    expect(forbidden.status).toBe(403);

    // Super admin has all permissions
    const list = await as('root').get('/api/v1/customers');
    expect(list.status).toBe(200);
  });

  it('lists customers with lifetime spend, orders, points, and segment', async () => {
    const res = await as('root').get('/api/v1/customers');
    const data = await ok(res);
    expect(res.body.meta.total).toBe(2);

    const lina = data.find((c) => c.id === customerA.id);
    expect(lina).toBeDefined();
    expect(lina.name).toBe('Lina Al-Mansour');
    expect(lina.orderCount).toBe(1);
    expect(lina.lifetimeSpend).toBe(250_000);
    expect(lina.loyaltyPoints).toBe(25);
    expect(lina.segment).toBe(CUSTOMER_SEGMENTS.VIP); // Spend >= 200,000 halalas

    const sami = data.find((c) => c.id === customerB.id);
    expect(sami).toBeDefined();
    expect(sami.orderCount).toBe(0);
    expect(sami.lifetimeSpend).toBe(0);
    expect(sami.loyaltyPoints).toBe(0);
    expect(sami.segment).toBe(CUSTOMER_SEGMENTS.NEW); // Registered just now with 0 orders
  });

  it('filters customers by segment', async () => {
    const vipRes = await as('root').get('/api/v1/customers?segment=vip');
    const vips = await ok(vipRes);
    expect(vips.length).toBe(1);
    expect(vips[0].id === customerA.id).toBe(true);

    const newRes = await as('root').get('/api/v1/customers?segment=new');
    const news = await ok(newRes);
    expect(news.length).toBe(1);
    expect(news[0].id === customerB.id).toBe(true);
  });

  it('searches customers by name, email, or phone', async () => {
    const res = await as('root').get('/api/v1/customers?q=Ghamdi');
    const data = await ok(res);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(customerB.id);

    const phoneRes = await as('root').get('/api/v1/customers?q=0501112233');
    const phoneData = await ok(phoneRes);
    expect(phoneData.length).toBe(1);
    expect(phoneData[0].id).toBe(customerA.id);
  });

  it('returns segment summary counts', async () => {
    const res = await as('root').get('/api/v1/customers/segments');
    const summary = await ok(res);
    expect(summary.all).toBe(2);
    expect(summary.vip).toBe(1);
    expect(summary.new).toBe(1);
    expect(summary.loyal).toBe(0);
    expect(summary.idle).toBe(0);
  });

  it('returns detailed customer profile with stats, loyalty, and recent orders', async () => {
    const res = await as('root').get(`/api/v1/customers/${customerA.id}`);
    const detail = await ok(res);

    expect(detail.id).toBe(customerA.id);
    expect(detail.name).toBe('Lina Al-Mansour');
    expect(detail.stats.orderCount).toBe(1);
    expect(detail.stats.lifetimeSpend).toBe(250_000);
    expect(detail.stats.averageOrderValue).toBe(250_000);
    expect(detail.stats.segment).toBe(CUSTOMER_SEGMENTS.VIP);
    expect(detail.loyalty.account.pointsBalance).toBe(25);
    expect(detail.recentOrders.length).toBe(1);
    expect(detail.recentOrders[0].orderNo).toBe('ORD-000001');
  });

  it('updates customer name, phone, status, and language', async () => {
    const patchRes = await as('root').patch(`/api/v1/customers/${customerA.id}`, {
      name: 'Lina M. Al-Mansour',
      status: 'disabled',
      lang: 'ar',
    });
    const updated = await ok(patchRes);
    expect(updated.name).toBe('Lina M. Al-Mansour');
    expect(updated.status).toBe('disabled');
    expect(updated.lang).toBe('ar');

    // Phone conflict check
    const clash = await as('root').patch(`/api/v1/customers/${customerA.id}`, {
      phone: customerB.phone,
    });
    expect(clash.status).toBe(409);
  });

  it('returns 404 for non-existent customer', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await as('root').get(`/api/v1/customers/${fakeId}`);
    expect(res.status).toBe(404);
  });
});
