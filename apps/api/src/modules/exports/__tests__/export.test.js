import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createLocalStorage } from '../../../adapters/storage/local.js';
import { setPrivateStorage } from '../../../adapters/storage/index.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { StockLevel } from '../../inventory/stock.model.js';
import { Order } from '../../orders/order.model.js';
import { Product, Variant } from '../../products/product.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { processExportJob, setExportRunner } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
let app;
let storageDir;
let rootToken;
let cashierToken;
let accountantToken;
let branchId;

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'universal-export-test-'));
  setPrivateStorage(createLocalStorage({ rootDir: storageDir, publicUrl: 'private:' }));
  setExportRunner(async (id) => {
    await processExportJob(id);
  });
});

afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true }).catch(() => {});
});

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

  branchId = new mongoose.Types.ObjectId();

  // Create cashier (no audit.view or report.view)
  const cashierRoleId = await findSystemRoleId('cashier');
  await createStaff(null, {
    name: 'Cashier Staff',
    email: 'cashier@shop.test',
    password: ADMIN_PW,
    roleId: cashierRoleId,
    allBranches: false,
    branchIds: [String(branchId)],
  });
  cashierToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'cashier@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

  // Create accountant (has order.export, report.export, product.viewCost)
  const accountantRoleId = await findSystemRoleId('accountant');
  await createStaff(null, {
    name: 'Accountant Staff',
    email: 'accountant@shop.test',
    password: ADMIN_PW,
    roleId: accountantRoleId,
    allBranches: true,
  });
  accountantToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'accountant@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

  // Seed sample product and variant
  const p = await Product.create({
    slug: 'export-tee',
    name: { en: 'Export Tee' },
    status: 'active',
  });
  const v = await Variant.create({
    productId: p._id,
    sku: 'TEE-EXP',
    barcode: '628100000001',
    price: 10000, // 100.00 SAR
    cost: 4000, // 40.00 SAR
    active: true,
  });

  // Seed sample order
  await Order.create({
    orderNo: 'ORD-EXP-001',
    channel: 'pos',
    status: 'completed',
    placedAt: new Date(),
    branchId,
    customer: { name: 'Ali Ahmed', phone: '+966512345678' },
    items: [
      {
        productId: p._id,
        variantId: v._id,
        sku: 'TEE-EXP',
        name: 'Export Tee',
        qty: 2,
        unitPrice: 10000,
        lineTotal: 20000,
        net: 17391,
        vat: 2609,
        vatRateBps: 1500,
      },
    ],
    totals: { itemCount: 2, subtotal: 20000, net: 17391, vat: 2609, total: 20000 },
    payment: { method: 'cash', status: 'paid' },
    currency: 'SAR',
  });
});

describe('Universal Export & Report Builder API (P8.4)', () => {
  it('denies export creation when staff lacks permission for the resource', async () => {
    // Cashier does not have audit.view
    const res = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        resource: 'audit',
        format: 'csv',
      });
    expect(res.status).toBe(403);
  });

  it('creates and executes background export for orders in CSV, XLSX, and JSON formats', async () => {
    // 1. CSV export
    const startCsv = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        resource: 'orders',
        format: 'csv',
        columns: ['orderNo', 'channel', 'status', 'total'],
        title: 'Orders CSV',
      });
    expect(startCsv.status).toBe(202);
    const csvJobId = startCsv.body.data.id;
    expect(startCsv.body.data.resource).toBe('orders');
    expect(startCsv.body.data.format).toBe('csv');

    // Retrieve finished job
    const jobCsv = (
      await request(app)
        .get(`/api/v1/exports/jobs/${csvJobId}`)
        .set('Authorization', `Bearer ${rootToken}`)
    ).body.data;
    expect(jobCsv.status).toBe('done');
    expect(jobCsv.counts.rows).toBe(1);
    expect(jobCsv.downloadable).toBe(true);

    // Download CSV and check content
    const dlCsv = await request(app)
      .get(`/api/v1/exports/jobs/${csvJobId}/download`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(dlCsv.status).toBe(200);
    expect(dlCsv.headers['content-type']).toContain('text/csv');
    expect(dlCsv.text).toContain('\uFEFF'); // UTF-8 BOM
    expect(dlCsv.text).toContain('Order Number');
    expect(dlCsv.text).toContain('ORD-EXP-001');
    expect(dlCsv.text).toContain('200.00'); // Halalas formatted to SAR

    // 2. JSON export
    const startJson = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        resource: 'orders',
        format: 'json',
        columns: ['orderNo', 'channel', 'total'],
      });
    expect(startJson.status).toBe(202);
    const jsonJobId = startJson.body.data.id;

    const dlJson = await request(app)
      .get(`/api/v1/exports/jobs/${jsonJobId}/download`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(dlJson.status).toBe(200);
    expect(dlJson.headers['content-type']).toContain('application/json');
    const parsedJson = JSON.parse(dlJson.text);
    expect(Array.isArray(parsedJson)).toBe(true);
    expect(parsedJson[0].orderNo).toBe('ORD-EXP-001');

    // 3. XLSX export
    const startXlsx = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        resource: 'orders',
        format: 'xlsx',
      });
    expect(startXlsx.status).toBe(202);
    const xlsxJobId = startXlsx.body.data.id;

    const binary = (res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    const dlXlsx = await request(app)
      .get(`/api/v1/exports/jobs/${xlsxJobId}/download`)
      .set('Authorization', `Bearer ${rootToken}`)
      .buffer()
      .parse(binary);
    expect(dlXlsx.status).toBe(200);
    expect(dlXlsx.headers['content-type']).toContain('spreadsheetml');
    expect(dlXlsx.body.length).toBeGreaterThan(100);
  });

  it('protects against formula injection in CSV exports', async () => {
    // Seed order with formula-like customer name
    await Order.create({
      orderNo: 'ORD-FORMULA-01',
      channel: 'pos',
      status: 'completed',
      placedAt: new Date(),
      customer: { name: '=SUM(A1:A10)', phone: '+966512345679' },
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          variantId: new mongoose.Types.ObjectId(),
          sku: 'SKU-FORM',
          name: 'Item',
          qty: 1,
          unitPrice: 1000,
          lineTotal: 1000,
          net: 870,
          vat: 130,
          vatRateBps: 1500,
        },
      ],
      totals: { itemCount: 1, subtotal: 1000, net: 870, vat: 130, total: 1000 },
      payment: { method: 'cash', status: 'paid' },
      currency: 'SAR',
    });

    const start = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        resource: 'orders',
        format: 'csv',
        columns: ['orderNo', 'customerName'],
      });
    const jobId = start.body.data.id;

    const res = await request(app)
      .get(`/api/v1/exports/jobs/${jobId}/download`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(res.status).toBe(200);
    // Equals sign is neutralized with leading single quote
    expect(res.text).toContain("'=SUM(A1:A10)");
  });

  it('redacts cost and profit margins for staff without product.viewCost', async () => {
    // Cashier has product.view but NOT product.viewCost
    const start = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        resource: 'products',
        format: 'json',
        columns: ['sku', 'price', 'cost', 'marginPercent'],
      });
    expect(start.status).toBe(202);
    const jobId = start.body.data.id;

    const res = await request(app)
      .get(`/api/v1/exports/jobs/${jobId}/download`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.text);
    expect(data[0].sku).toBe('TEE-EXP');
    expect(data[0].price).toBe('100.00');
    // cost and marginPercent must be completely omitted
    expect(data[0].cost).toBeUndefined();
    expect(data[0].marginPercent).toBeUndefined();
  });

  it('denies downloading export file created by another user', async () => {
    const start = await request(app)
      .post('/api/v1/exports')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        resource: 'orders',
        format: 'csv',
      });
    const jobId = start.body.data.id;

    // Cashier tries to download root admin's export
    const res = await request(app)
      .get(`/api/v1/exports/jobs/${jobId}/download`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  it('supports report presets CRUD for Report Builder', async () => {
    // 1. Create preset
    const created = await request(app)
      .post('/api/v1/exports/presets')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        name: 'Weekly Sales Audit',
        resource: 'orders',
        columns: ['orderNo', 'customerName', 'total', 'createdAt'],
        format: 'xlsx',
        filters: { channel: 'pos' },
      });
    expect(created.status).toBe(201);
    const presetId = created.body.data.id;
    expect(created.body.data.name).toBe('Weekly Sales Audit');

    // 2. List presets
    const list = await request(app)
      .get('/api/v1/exports/presets?resource=orders')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((p) => p.id === presetId)).toBe(true);

    // 3. Delete preset
    const del = await request(app)
      .delete(`/api/v1/exports/presets/${presetId}`)
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(del.status).toBe(200);

    // List again - should not be present
    const listAfter = await request(app)
      .get('/api/v1/exports/presets?resource=orders')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(listAfter.body.data.some((p) => p.id === presetId)).toBe(false);
  });

  it('returns resources metadata and permitted columns', async () => {
    const res = await request(app)
      .get('/api/v1/exports/resources')
      .set('Authorization', `Bearer ${rootToken}`);
    expect(res.status).toBe(200);
    const resources = res.body.data;
    expect(resources.orders).toBeDefined();
    expect(resources.products).toBeDefined();
    expect(resources.customers).toBeDefined();
    expect(resources.inventory).toBeDefined();
    expect(resources.performance).toBeDefined();
    expect(resources.stockout).toBeDefined();
    expect(resources.audit).toBeDefined();

    // Check columns structure
    const orderCols = resources.orders;
    expect(orderCols.some((c) => c.key === 'orderNo')).toBe(true);
    expect(orderCols.some((c) => c.key === 'total')).toBe(true);
  });
});
