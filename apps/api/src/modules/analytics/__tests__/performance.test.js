import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Brand } from '../../brands/brand.model.js';
import { Category } from '../../categories/category.model.js';
import { Customer } from '../../customers/customer.model.js';
import { Order } from '../../orders/order.model.js';
import { Product, Variant } from '../../products/product.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const BASE = '/api/v1/analytics/performance';
let app;
let rootToken;
let cashierToken;
const branch1 = new mongoose.Types.ObjectId();
const _branch2 = new mongoose.Types.ObjectId();

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([
    Order.init(),
    Product.init(),
    Variant.init(),
    Category.init(),
    Brand.init(),
    Customer.init(),
  ]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });

  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

  // Create a branch-scoped cashier (pos only, lacking report.view)
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

describe('Performance Analytics API Module (P8.2)', () => {
  it('denies performance report access without report.view permission', async () => {
    const res = await request(app).get(BASE).set('Authorization', `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns performance report by product with and without product.viewCost', async () => {
    const now = new Date();
    const prodId1 = new mongoose.Types.ObjectId();
    const prodId2 = new mongoose.Types.ObjectId();
    const varId1 = new mongoose.Types.ObjectId();
    const varId2 = new mongoose.Types.ObjectId();

    // Create products & variants with cost
    await Product.create([
      {
        _id: prodId1,
        name: { en: 'Cold Brew Blend' },
        slug: 'cold-brew-blend',
        status: 'active',
      },
      {
        _id: prodId2,
        name: { en: 'Ceramic Pour Over' },
        slug: 'ceramic-pour-over',
        status: 'active',
      },
    ]);

    await Variant.create([
      {
        _id: varId1,
        productId: prodId1,
        sku: 'CB-001',
        price: 5000,
        cost: 2000,
      },
      {
        _id: varId2,
        productId: prodId2,
        sku: 'PO-001',
        price: 10000,
        cost: 6000,
      },
    ]);

    // Create orders
    await Order.create([
      {
        orderNo: 'ORD-101',
        channel: 'online',
        status: 'completed',
        branchId: branch1,
        customer: { name: 'Customer 1', phone: '+966500000001' },
        placedAt: now,
        items: [
          {
            productId: prodId1,
            variantId: varId1,
            sku: 'CB-001',
            name: 'Cold Brew Blend',
            unitPrice: 5000,
            qty: 3,
            vatRateBps: 1500,
            lineTotal: 15000,
            net: 13043,
            vat: 1957,
          },
        ],
        totals: { itemCount: 3, subtotal: 15000, net: 13043, vat: 1957, total: 15000 },
        payment: { method: 'card', status: 'paid' },
      },
      {
        orderNo: 'ORD-102',
        channel: 'pos',
        status: 'completed',
        branchId: branch1,
        customer: { name: 'Customer 2', phone: '+966500000002' },
        placedAt: now,
        items: [
          {
            productId: prodId2,
            variantId: varId2,
            sku: 'PO-001',
            name: 'Ceramic Pour Over',
            unitPrice: 10000,
            qty: 1,
            vatRateBps: 1500,
            lineTotal: 10000,
            net: 8696,
            vat: 1304,
          },
        ],
        totals: { itemCount: 1, subtotal: 10000, net: 8696, vat: 1304, total: 10000 },
        payment: { method: 'cash', status: 'paid' },
      },
    ]);

    // 1. Root user (has product.viewCost)
    const res = await request(app)
      .get(`${BASE}?dimension=product&range=7d`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.dimension).toBe('product');
    expect(data.summary.totalRevenue).toBe(25000);
    expect(data.summary.totalUnits).toBe(4);
    expect(data.summary.totalOrders).toBe(2);

    // Cost and profit metrics visible for root
    expect(data.summary.totalCost).toBe(12000); // 3 * 2000 + 1 * 6000
    expect(data.summary.totalProfit).toBe(9739); // (13043 + 8696) - 12000
    expect(data.summary.overallMargin).toBeGreaterThan(0);

    expect(data.items.length).toBe(2);
    expect(data.items[0].name).toBe('Cold Brew Blend');
    expect(data.items[0].revenue).toBe(15000);
    expect(data.items[0].sharePercent).toBe(60);
    expect(data.items[0].cost).toBe(6000); // 3 * 2000
    expect(data.items[0].profit).toBe(7043); // 13043 - 6000

    expect(data.chart.length).toBe(2);
    expect(data.chart[0].name).toBe('Cold Brew Blend');

    // Also verify alias /api/v1/reports/performance works
    const resAlias = await request(app)
      .get('/api/v1/reports/performance?dimension=product')
      .set('Authorization', `Bearer ${rootToken}`);
    expect(resAlias.status).toBe(200);
    expect(resAlias.body.data.summary.totalRevenue).toBe(25000);
  });

  it('returns performance report by staff, category, brand, branch, and channel', async () => {
    const now = new Date();
    const staffId = new mongoose.Types.ObjectId();
    const catId = new mongoose.Types.ObjectId();
    const brandId = new mongoose.Types.ObjectId();
    const prodId = new mongoose.Types.ObjectId();
    const varId = new mongoose.Types.ObjectId();

    await Category.create({
      _id: catId,
      name: { en: 'Coffee Beans' },
      slug: 'coffee-beans',
    });

    await Brand.create({
      _id: brandId,
      name: 'Artisan Roasters',
      nameKey: 'artisan roasters',
      slug: 'artisan-roasters',
    });

    await Product.create({
      _id: prodId,
      name: { en: 'House Blend' },
      slug: 'house-blend',
      categoryIds: [catId],
      brandId,
    });

    await Variant.create({
      _id: varId,
      productId: prodId,
      sku: 'HB-01',
      price: 8000,
    });

    await Order.create({
      orderNo: 'POS-STAFF-1',
      channel: 'pos',
      status: 'completed',
      branchId: branch1,
      staffId,
      customer: { name: 'Walk-in', phone: '+966500000099' },
      placedAt: now,
      items: [
        {
          productId: prodId,
          variantId: varId,
          sku: 'HB-01',
          name: 'House Blend',
          unitPrice: 8000,
          qty: 2,
          vatRateBps: 1500,
          lineTotal: 16000,
          net: 13913,
          vat: 2087,
        },
      ],
      totals: { itemCount: 2, subtotal: 16000, net: 13913, vat: 2087, total: 16000 },
      payment: { method: 'cash', status: 'paid' },
    });

    // 1. Staff dimension
    const resStaff = await request(app)
      .get(`${BASE}?dimension=staff`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(resStaff.status).toBe(200);
    expect(resStaff.body.data.items.length).toBe(1);
    expect(resStaff.body.data.items[0].ordersCount).toBe(1);
    expect(resStaff.body.data.items[0].revenue).toBe(16000);

    // 2. Category dimension
    const resCat = await request(app)
      .get(`${BASE}?dimension=category`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(resCat.status).toBe(200);
    expect(resCat.body.data.items.length).toBe(1);
    expect(resCat.body.data.items[0].name).toBe('Coffee Beans');
    expect(resCat.body.data.items[0].quantity).toBe(2);

    // 3. Brand dimension
    const resBrand = await request(app)
      .get(`${BASE}?dimension=brand`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(resBrand.status).toBe(200);
    expect(resBrand.body.data.items.length).toBe(1);
    expect(resBrand.body.data.items[0].name).toBe('Artisan Roasters');

    // 4. Branch dimension
    const resBranch = await request(app)
      .get(`${BASE}?dimension=branch`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(resBranch.status).toBe(200);
    expect(resBranch.body.data.items.length).toBe(1);
    expect(resBranch.body.data.items[0].revenue).toBe(16000);

    // 5. Channel dimension
    const resChannel = await request(app)
      .get(`${BASE}?dimension=channel`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(resChannel.status).toBe(200);
    expect(resChannel.body.data.items.length).toBe(1);
    expect(resChannel.body.data.items[0].channel).toBe('pos');
    expect(resChannel.body.data.items[0].revenue).toBe(16000);
  });
});
