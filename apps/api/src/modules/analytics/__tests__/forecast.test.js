import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { StockLevel } from '../../inventory/stock.model.js';
import { Order } from '../../orders/order.model.js';
import { Product, Variant } from '../../products/product.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
let app;
let rootToken;
let cashierToken;
const branch1 = new mongoose.Types.ObjectId();
const branch2 = new mongoose.Types.ObjectId();

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Order.init(), Product.init(), Variant.init(), StockLevel.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });

  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

  // Create a branch-scoped cashier without report.view
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

describe('Forecasting & Stockout Prediction API (P8.3)', () => {
  it('denies forecast endpoints without report.view permission', async () => {
    const resSales = await request(app)
      .get('/api/v1/analytics/forecast/sales')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(resSales.status).toBe(403);
    expect(resSales.body.error.code).toBe('FORBIDDEN');

    const resStockout = await request(app)
      .get('/api/v1/analytics/forecast/stockout')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(resStockout.status).toBe(403);
    expect(resStockout.body.error.code).toBe('FORBIDDEN');
  });

  it('generates sales forecast with moving average and seasonality strategies', async () => {
    const productId = new mongoose.Types.ObjectId();
    const variantId = new mongoose.Types.ObjectId();

    await Product.create({
      _id: productId,
      name: { en: 'Organic Coffee Beans' },
      slug: 'organic-coffee-beans',
      status: 'active',
      priceMin: 5000,
      priceMax: 5000,
      variantCount: 1,
    });

    await Variant.create({
      _id: variantId,
      productId,
      sku: 'COFFEE-01',
      price: 5000,
      cost: 2000,
      active: true,
      position: 0,
    });

    // Create 3 orders placed across recent days
    const now = new Date();
    const day1 = new Date(now.getTime() - 3 * 86400000);
    const day2 = new Date(now.getTime() - 2 * 86400000);
    const day3 = new Date(now.getTime() - 1 * 86400000);

    await Order.create([
      {
        orderNo: 'ORD-F001',
        channel: 'online',
        status: 'delivered',
        branchId: branch1,
        placedAt: day1,
        customer: { name: 'Ali', phone: '0501111111' },
        totals: {
          itemCount: 2,
          subtotal: 10000,
          total: 10000,
          net: 8696,
          vat: 1304,
          discountTotal: 0,
        },
        payment: { method: 'card', status: 'paid' },
        items: [
          {
            productId,
            variantId,
            sku: 'COFFEE-01',
            name: 'Organic Coffee Beans',
            qty: 2,
            unitPrice: 5000,
            lineTotal: 10000,
            net: 8696,
            vat: 1304,
            vatRateBps: 1500,
          },
        ],
      },
      {
        orderNo: 'ORD-F002',
        channel: 'pos',
        status: 'completed',
        branchId: branch1,
        placedAt: day2,
        customer: { name: 'Sara', phone: '' },
        totals: {
          itemCount: 4,
          subtotal: 20000,
          total: 20000,
          net: 17392,
          vat: 2608,
          discountTotal: 0,
        },
        payment: { method: 'cash', status: 'paid' },
        items: [
          {
            productId,
            variantId,
            sku: 'COFFEE-01',
            name: 'Organic Coffee Beans',
            qty: 4,
            unitPrice: 5000,
            lineTotal: 20000,
            net: 17392,
            vat: 2608,
            vatRateBps: 1500,
          },
        ],
      },
      {
        orderNo: 'ORD-F003',
        channel: 'pos',
        status: 'completed',
        branchId: branch2,
        placedAt: day3,
        customer: { name: 'Omar', phone: '' },
        totals: {
          itemCount: 6,
          subtotal: 30000,
          total: 30000,
          net: 26088,
          vat: 3912,
          discountTotal: 0,
        },
        payment: { method: 'card', status: 'paid' },
        items: [
          {
            productId,
            variantId,
            sku: 'COFFEE-01',
            name: 'Organic Coffee Beans',
            qty: 6,
            unitPrice: 5000,
            lineTotal: 30000,
            net: 26088,
            vat: 3912,
            vatRateBps: 1500,
          },
        ],
      },
    ]);

    // Test Moving Average Strategy
    const resSMA = await request(app)
      .get('/api/v1/analytics/forecast/sales?strategy=moving_average&horizon=7d&lookback=14d')
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resSMA.status).toBe(200);
    expect(resSMA.body.data.strategy.name).toBe('moving_average');
    expect(resSMA.body.data.horizonDays).toBe(7);
    expect(resSMA.body.data.lookbackDays).toBe(14);
    expect(resSMA.body.data.historical).toHaveLength(14);
    expect(resSMA.body.data.forecast).toHaveLength(7);
    expect(resSMA.body.data.summary.historicalTotalUnits).toBe(12);
    expect(resSMA.body.data.summary.historicalTotalRevenue).toBe(60000);
    expect(resSMA.body.data.summary.forecastTotalUnits).toBeGreaterThan(0);

    // Test Seasonality Strategy
    const resSeasonal = await request(app)
      .get('/api/v1/analytics/forecast/sales?strategy=seasonality&horizon=7d&lookback=14d')
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resSeasonal.status).toBe(200);
    expect(resSeasonal.body.data.strategy.name).toBe('seasonality');
    expect(resSeasonal.body.data.forecast).toHaveLength(7);

    // Test branch scoping
    const resBranch1 = await request(app)
      .get(`/api/v1/analytics/forecast/sales?branchId=${branch1}&lookback=14d`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resBranch1.status).toBe(200);
    expect(resBranch1.body.data.summary.historicalTotalUnits).toBe(6); // Orders 1 & 2 only
    expect(resBranch1.body.data.summary.historicalTotalRevenue).toBe(30000);
  });

  it('predicts stock-out dates, risk levels, and replenishment recommendations', async () => {
    const prod1 = new mongoose.Types.ObjectId();
    const var1 = new mongoose.Types.ObjectId(); // Out of stock
    const prod2 = new mongoose.Types.ObjectId();
    const var2 = new mongoose.Types.ObjectId(); // Critical risk (on hand 4, sold 60 in 30 days = 2/day -> 2 days left)
    const prod3 = new mongoose.Types.ObjectId();
    const var3 = new mongoose.Types.ObjectId(); // Healthy (on hand 100, sold 30 in 30 days = 1/day -> 100 days left)

    await Product.create([
      {
        _id: prod1,
        name: { en: 'Product Out' },
        slug: 'product-out',
        status: 'active',
        priceMin: 1000,
        priceMax: 1000,
        variantCount: 1,
      },
      {
        _id: prod2,
        name: { en: 'Product Critical' },
        slug: 'product-critical',
        status: 'active',
        priceMin: 2000,
        priceMax: 2000,
        variantCount: 1,
      },
      {
        _id: prod3,
        name: { en: 'Product Healthy' },
        slug: 'product-healthy',
        status: 'active',
        priceMin: 3000,
        priceMax: 3000,
        variantCount: 1,
      },
    ]);

    await Variant.create([
      { _id: var1, productId: prod1, sku: 'SKU-OUT', price: 1000, active: true },
      { _id: var2, productId: prod2, sku: 'SKU-CRIT', price: 2000, active: true },
      { _id: var3, productId: prod3, sku: 'SKU-HEALTHY', price: 3000, active: true },
    ]);

    // Seed stock levels
    await StockLevel.create([
      { variantId: var1, productId: prod1, branchId: branch1, onHand: 0, lowStockThreshold: 10 },
      { variantId: var2, productId: prod2, branchId: branch1, onHand: 4, lowStockThreshold: 5 },
      { variantId: var3, productId: prod3, branchId: branch1, onHand: 100, lowStockThreshold: 5 },
    ]);

    // Seed historical order for var2: sold 60 units in past 30 days
    const orderDate = new Date(Date.now() - 5 * 86400000);
    await Order.create([
      {
        orderNo: 'ORD-VEL-1',
        channel: 'pos',
        status: 'completed',
        branchId: branch1,
        placedAt: orderDate,
        customer: { name: 'Test', phone: '' },
        totals: {
          itemCount: 60,
          subtotal: 120000,
          total: 120000,
          net: 104348,
          vat: 15652,
          discountTotal: 0,
        },
        payment: { method: 'cash', status: 'paid' },
        items: [
          {
            productId: prod2,
            variantId: var2,
            sku: 'SKU-CRIT',
            name: 'Product Critical',
            qty: 60,
            unitPrice: 2000,
            lineTotal: 120000,
            net: 104348,
            vat: 15652,
            vatRateBps: 1500,
          },
        ],
      },
    ]);

    // Test Stockout Forecast API
    const res = await request(app)
      .get(`/api/v1/analytics/forecast/stockout?branchId=${branch1}&lookback=30d`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalTracked).toBe(3);
    expect(res.body.data.summary.outOfStockCount).toBe(1);
    expect(res.body.data.summary.criticalCount).toBe(1);
    expect(res.body.data.summary.healthyCount).toBe(1);

    const items = res.body.data.items;
    const outItem = items.find((i) => i.sku === 'SKU-OUT');
    expect(outItem.riskLevel).toBe('out_of_stock');
    expect(outItem.daysRemaining).toBe(0);

    const critItem = items.find((i) => i.sku === 'SKU-CRIT');
    expect(critItem.riskLevel).toBe('critical');
    expect(critItem.dailyVelocity).toBe(2); // 60 units / 30 days = 2 units/day
    expect(critItem.daysRemaining).toBe(2); // 4 on hand / 2 daily = 2 days
    expect(critItem.recommendedReorderQty).toBe(56); // target 30 days * 2 = 60 - 4 on hand = 56

    // Test filter by risk
    const resFiltered = await request(app)
      .get(`/api/v1/analytics/forecast/stockout?branchId=${branch1}&risk=critical`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resFiltered.status).toBe(200);
    expect(resFiltered.body.data.items).toHaveLength(1);
    expect(resFiltered.body.data.items[0].sku).toBe('SKU-CRIT');

    // Test search
    const resSearch = await request(app)
      .get(`/api/v1/analytics/forecast/stockout?branchId=${branch1}&search=HEALTHY`)
      .set('Authorization', `Bearer ${rootToken}`);

    expect(resSearch.status).toBe(200);
    expect(resSearch.body.data.items).toHaveLength(1);
    expect(resSearch.body.data.items[0].sku).toBe('SKU-HEALTHY');
  });
});
