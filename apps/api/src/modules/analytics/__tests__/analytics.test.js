import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Customer } from '../../customers/customer.model.js';
import { StockLevel } from '../../inventory/stock.model.js';
import { Order } from '../../orders/order.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const BASE = '/api/v1/analytics/dashboard';
let app;
let rootToken;
let cashierToken;
const branch1 = new mongoose.Types.ObjectId();
const branch2 = new mongoose.Types.ObjectId();

const asRoot = () => request(app).get(BASE).set('Authorization', `Bearer ${rootToken}`);
const asCashier = () => request(app).get(BASE).set('Authorization', `Bearer ${cashierToken}`);

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Order.init(), StockLevel.init(), Customer.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });

  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

  // Create a branch-scoped cashier (pos only, no dashboard.view initially)
  const cashierRoleId = await findSystemRoleId('cashier');
  await createStaff(null, {
    name: 'Cashier One',
    email: 'cashier@shop.test',
    password: ADMIN_PW,
    roleId: cashierRoleId,
    allBranches: false,
    branchIds: [String(branch1)],
  });

  cashierToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'cashier@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('Analytics API Module (P8.1)', () => {
  it('denies dashboard access without dashboard.view permission', async () => {
    const res = await asCashier();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns comprehensive dashboard overview with KPIs, charts, and breakdowns', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const prodA = new mongoose.Types.ObjectId();
    const prodB = new mongoose.Types.ObjectId();
    const varA = new mongoose.Types.ObjectId();
    const varB = new mongoose.Types.ObjectId();

    // Current period order 1 (Branch 1, POS)
    await Order.create({
      orderNo: 'POS-001',
      channel: 'pos',
      status: 'completed',
      branchId: branch1,
      customer: { name: 'Ahmed Ali', phone: '+966500000001' },
      placedAt: twoDaysAgo,
      items: [
        {
          productId: prodA,
          variantId: varA,
          sku: 'SKU-A',
          name: 'Classic T-Shirt',
          unitPrice: 10000,
          qty: 2,
          vatRateBps: 1500,
          lineTotal: 20000,
          net: 17391,
          vat: 2609,
        },
      ],
      totals: {
        itemCount: 2,
        subtotal: 20000,
        net: 17391,
        vat: 2609,
        total: 20000,
        discountTotal: 0,
      },
      payment: { method: 'cash', status: 'paid', methodType: 'offline' },
    });

    // Current period order 2 (Branch 2, Online)
    await Order.create({
      orderNo: 'ORD-002',
      channel: 'online',
      status: 'paid',
      branchId: branch2,
      customer: { name: 'Sarah Omar', phone: '+966500000002', email: 'sarah@test.com' },
      placedAt: now,
      items: [
        {
          productId: prodB,
          variantId: varB,
          sku: 'SKU-B',
          name: 'Coffee Mug',
          unitPrice: 5000,
          qty: 1,
          vatRateBps: 1500,
          lineTotal: 5000,
          net: 4348,
          vat: 652,
        },
      ],
      totals: {
        itemCount: 1,
        subtotal: 5000,
        net: 4348,
        vat: 652,
        total: 5000,
        discountTotal: 0,
      },
      payment: { method: 'card', status: 'paid', methodType: 'gateway' },
    });

    // Previous period order (Branch 1, 10 days ago)
    await Order.create({
      orderNo: 'ORD-PREV',
      channel: 'online',
      status: 'completed',
      branchId: branch1,
      customer: { name: 'Old Customer', phone: '+966500000003' },
      placedAt: tenDaysAgo,
      items: [
        {
          productId: prodA,
          variantId: varA,
          sku: 'SKU-A',
          name: 'Classic T-Shirt',
          unitPrice: 10000,
          qty: 1,
          vatRateBps: 1500,
          lineTotal: 10000,
          net: 8696,
          vat: 1304,
        },
      ],
      totals: {
        itemCount: 1,
        subtotal: 10000,
        net: 8696,
        vat: 1304,
        total: 10000,
        discountTotal: 0,
      },
      payment: { method: 'card', status: 'paid' },
    });

    // Seed stock levels
    await StockLevel.create([
      { variantId: varA, productId: prodA, branchId: branch1, onHand: 15, lowStockThreshold: 5 },
      { variantId: varB, productId: prodB, branchId: branch1, onHand: 3, lowStockThreshold: 5 }, // low stock
      {
        variantId: new mongoose.Types.ObjectId(),
        productId: prodA,
        branchId: branch1,
        onHand: 0,
        lowStockThreshold: 5,
      }, // out of stock
    ]);

    const res = await asRoot();
    expect(res.status).toBe(200);

    const { kpis, salesOverTime, channelBreakdown, topProducts, recentOrders, paymentMethods } =
      res.body.data;

    // Overall current totals: 20000 + 5000 = 25000 SAR halalas
    expect(kpis.totalSales.current).toBe(25000);
    expect(kpis.totalSales.previous).toBe(10000);
    expect(kpis.totalSales.changePercent).toBe(150);

    expect(kpis.ordersCount.current).toBe(2);
    expect(kpis.ordersCount.previous).toBe(1);

    expect(kpis.averageOrderValue.current).toBe(12500); // 25000 / 2
    expect(kpis.itemsSold.current).toBe(3);

    // Inventory health
    expect(kpis.inventory.lowStockCount).toBe(1);
    expect(kpis.inventory.outOfStockCount).toBe(1);

    // Channel breakdown
    expect(channelBreakdown.pos.orders).toBe(1);
    expect(channelBreakdown.pos.revenue).toBe(20000);
    expect(channelBreakdown.online.orders).toBe(1);
    expect(channelBreakdown.online.revenue).toBe(5000);

    // Top products
    expect(topProducts.length).toBe(2);
    expect(topProducts[0].sku).toBe('SKU-A');
    expect(topProducts[0].qty).toBe(2);
    expect(topProducts[0].revenue).toBe(20000);

    // Recent orders (3 orders created)
    expect(recentOrders.length).toBe(3);
    expect(recentOrders[0].orderNo).toBe('ORD-002');

    // Payment methods
    expect(paymentMethods.length).toBe(2);

    // Time-series continuous coverage
    expect(salesOverTime.length).toBeGreaterThanOrEqual(7);
  });

  it('filters dashboard metrics to a specific branch', async () => {
    const now = new Date();

    await Order.create([
      {
        orderNo: 'B1-01',
        channel: 'pos',
        status: 'completed',
        branchId: branch1,
        customer: { name: 'Customer B1', phone: '+966500000010' },
        placedAt: now,
        items: [],
        totals: { itemCount: 1, subtotal: 10000, net: 8696, vat: 1304, total: 10000 },
        payment: { method: 'cash', status: 'paid' },
      },
      {
        orderNo: 'B2-01',
        channel: 'online',
        status: 'completed',
        branchId: branch2,
        customer: { name: 'Customer B2', phone: '+966500000020' },
        placedAt: now,
        items: [],
        totals: { itemCount: 2, subtotal: 40000, net: 34782, vat: 5218, total: 40000 },
        payment: { method: 'card', status: 'paid' },
      },
    ]);

    const resB1 = await request(app)
      .get(`${BASE}?branchId=${String(branch1)}`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resB1.status).toBe(200);
    expect(resB1.body.data.kpis.totalSales.current).toBe(10000);
    expect(resB1.body.data.kpis.ordersCount.current).toBe(1);

    const resB2 = await request(app)
      .get(`${BASE}?branchId=${String(branch2)}`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resB2.status).toBe(200);
    expect(resB2.body.data.kpis.totalSales.current).toBe(40000);
    expect(resB2.body.data.kpis.ordersCount.current).toBe(1);
  });

  it('handles today range query with hourly intervals', async () => {
    const res = await request(app)
      .get(`${BASE}?range=today`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.period.range).toBe('today');
    expect(res.body.data.period.groupBy).toBe('hour');
    expect(res.body.data.salesOverTime.length).toBe(24);
  });
});
