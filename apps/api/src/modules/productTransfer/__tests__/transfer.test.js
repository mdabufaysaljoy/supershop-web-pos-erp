import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createLocalStorage } from '../../../adapters/storage/local.js';
import { setPrivateStorage } from '../../../adapters/storage/index.js';
import { createApp } from '../../../app.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { processTransferJob, setTransferRunner } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
let dir;
const tokens = {};
const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    upload: (buf, name, fields = {}) => {
      const req = auth(request(app).post('/api/v1/product-transfers/imports'));
      for (const [k, v] of Object.entries(fields)) req.field(k, String(v));
      return req.attach('file', buf, name);
    },
  };
};
const csv = (lines) => Buffer.from(`${lines.join('\n')}\n`, 'utf8');
const job = async (who, id) =>
  (await as(who).get(`/api/v1/product-transfers/jobs/${id}`)).body.data;
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const HEADER =
  'product_key,name,status,categories,brand,option1_name,option1_value,sku,barcode,price,compare_at_price,cost';

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'transfer-test-'));
  setPrivateStorage(createLocalStorage({ rootDir: dir, publicUrl: 'private:' }));
  setTransferRunner((id) => processTransferJob(id)); // inline instead of BullMQ
});
afterAll(() => rm(dir, { recursive: true, force: true }));

beforeEach(async () => {
  await loadSettings();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  for (const [who, key] of [
    ['catalog', 'catalog_editor'],
    ['cashier', 'cashier'],
  ]) {
    await createStaff(null, {
      name: 'Staff Member',
      email: `${who}@shop.test`,
      password: PW,
      roleId: await findSystemRoleId(key),
      branchIds: [],
    });
  }
  for (const who of ['root', 'catalog', 'cashier']) {
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: `${who}@shop.test`, password: PW });
    tokens[who] = res.body.data.accessToken;
  }
  await as('root').post('/api/v1/categories', { name: 'Men' });
  await as('root').post('/api/v1/brands', { name: 'Zentra' });
  await as('root').post('/api/v1/custom-fields', {
    entity: 'product',
    key: 'material',
    type: 'select',
    label: 'Material',
    options: [{ key: 'cotton', label: 'Cotton' }],
  });
});

describe('product import', () => {
  const FILE = csv([
    `${HEADER},cf.material`,
    'cotton-tee,Cotton Tee,active,men,Zentra,Size,M,TEE-M,,49,59,20,Cotton',
    'cotton-tee,,,,,Size,L,TEE-L,,49.50,,21,',
    'basmati-rice,Basmati Rice 5kg,draft,,,,,RICE-5KG,6281000000007,34.5,,,',
  ]);

  it('creates products with variants, options, references, custom fields and cost', async () => {
    const res = await as('root').upload(FILE, 'products.csv');
    expect(res.status).toBe(202);
    const done = await job('root', res.body.data.id);
    expect(done).toMatchObject({
      type: 'import',
      status: 'done',
      format: 'csv',
      fileName: 'products.csv',
      errorCount: 0,
      counts: { rows: 3, products: 2, processed: 2, created: 2, updated: 0, failed: 0 },
    });
    const list = (await as('root').get('/api/v1/products?q=TEE')).body.data;
    const tee = (await as('root').get(`/api/v1/products/${list[0].id}`)).body.data;
    expect(tee).toMatchObject({
      slug: 'cotton-tee',
      status: 'active',
      customFields: { material: 'cotton' },
      priceMin: 4900,
      priceMax: 4950,
    });
    expect(tee.variants.map((v) => [v.sku, v.price, v.compareAtPrice, v.cost])).toEqual([
      ['TEE-M', 4900, 5900, 2000],
      ['TEE-L', 4950, null, 2100],
    ]);
    expect(
      await readdir(path.join(dir, 'imports'), { recursive: true }).then((f) =>
        f.filter((x) => x.endsWith('.csv')),
      ),
    ).toEqual([]); // upload deleted
  });

  it('dry run validates without writing', async () => {
    const res = await as('root').upload(FILE, 'products.csv', { dryRun: true });
    expect((await job('root', res.body.data.id)).counts).toMatchObject({ created: 2, failed: 0 });
    expect((await as('root').get('/api/v1/products')).body.meta.total).toBe(0);
  });

  it('reports row/column errors and still imports the valid products', async () => {
    await as('root').post('/api/v1/products', {
      name: 'Existing',
      variants: [{ sku: 'TAKEN-1', price: 100 }],
    });
    const res = await as('root').upload(
      csv([
        HEADER,
        'bad-price,Bad price,,,,,,BP-1,,abc,,,',
        'bad-refs,Bad refs,,shoes,Nobody,,,BR-1,,10,,,',
        'taken,Taken,,,,,,TAKEN-1,,10,,,',
        'checksum,Checksum,,,,,,CK-1,6281000000000,10,,,',
        'no-name,,,,,,,NN-1,,10,,,',
        'good,Good one,,,,,,GOOD-1,,10,,,',
      ]),
      'mixed.csv',
    );
    const done = await job('root', res.body.data.id);
    expect(done.counts).toMatchObject({ created: 1, failed: 5 });
    expect(done.errors).toEqual(
      expect.arrayContaining([
        { row: 2, column: 'price', message: 'validation.money.invalid' },
        { row: 3, column: 'categories', message: 'validation.import.unknownReference' },
        { row: 3, column: 'brand', message: 'validation.import.unknownReference' },
        { row: 4, column: 'sku', message: 'validation.duplicate' },
        { row: 5, column: 'barcode', message: 'validation.code.checksum' },
        expect.objectContaining({ row: 6, column: 'name' }),
      ]),
    );
  });

  it('upsert updates existing products (other variants kept); create mode refuses them', async () => {
    await as('root').upload(FILE, 'products.csv');
    const res = await as('root').upload(
      csv(['product_key,sku,price', 'cotton-tee,TEE-L,55']),
      'prices.csv',
    );
    expect((await job('root', res.body.data.id)).counts).toMatchObject({ updated: 1, failed: 0 });
    const [tee] = (await as('root').get('/api/v1/products?q=cotton')).body.data;
    const detail = (await as('root').get(`/api/v1/products/${tee.id}`)).body.data;
    expect(detail.variants.map((v) => [v.sku, v.price, v.cost])).toEqual([
      ['TEE-L', 5500, 2100],
      ['TEE-M', 4900, 2000],
    ]);
    const create = await as('root').upload(
      csv(['product_key,sku,price', 'cotton-tee,TEE-L,1']),
      'again.csv',
      { mode: 'create' },
    );
    expect((await job('root', create.body.data.id)).errors).toEqual([
      { row: 2, column: 'product_key', message: 'validation.import.alreadyExists' },
    ]);
  });

  it('job-level failures: unreadable file, missing columns, permissions', async () => {
    expect(
      (await as('root').upload(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'image.png'))
        .status,
    ).toBe(415);
    const missing = await as('root').upload(csv(['name,price', 'X,1']), 'x.csv');
    expect(await job('root', missing.body.data.id)).toMatchObject({
      status: 'failed',
      failure: 'transfer.failure.missingColumns',
    });
    expect((await as('cashier').upload(FILE, 'p.csv')).status).toBe(403);
    expect(
      (await as('catalog').get(`/api/v1/product-transfers/jobs/${missing.body.data.id}`)).status,
    ).toBe(404); // not theirs
  });

  it('cost column is ignored for staff without product.viewCost', async () => {
    const res = await as('catalog').upload(FILE, 'products.csv');
    const done = await job('catalog', res.body.data.id);
    expect(done).toMatchObject({
      status: 'done',
      ignoredColumns: ['cost'],
      counts: { created: 2 },
    });
    const [tee] = (await as('root').get('/api/v1/products?q=cotton')).body.data;
    const detail = (await as('root').get(`/api/v1/products/${tee.id}`)).body.data;
    expect(detail.variants.map((v) => v.cost)).toEqual([null, null]);
  });
});

describe('product export & template', () => {
  it('template lists custom fields and cost only when permitted', async () => {
    const res = await as('root').get('/api/v1/product-transfers/template?format=csv');
    expect(res.headers['content-type']).toContain('text/csv');
    const header = res.text.replace('﻿', '').split('\r\n')[0].split(',');
    expect(header).toEqual(
      expect.arrayContaining(['product_key', 'sku', 'price', 'cost', 'cf.material']),
    );
    const xlsx = await as('catalog')
      .get('/api/v1/product-transfers/template')
      .buffer(true)
      .parse(binary);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    const cols = wb.worksheets[0].getRow(1).values.slice(1);
    expect(cols).not.toContain('cost');
    expect(wb.getWorksheet('Instructions')).toBeDefined();
  });

  it('exports to XLSX for its creator only, and the file re-imports cleanly', async () => {
    await as('root').upload(
      csv([
        `${HEADER},cf.material`,
        'cotton-tee,Cotton Tee,active,men,Zentra,Size,M,TEE-M,,49,59,20,Cotton',
        'cotton-tee,,,,,Size,L,TEE-L,,49.50,,21,',
      ]),
      'p.csv',
    );
    const start = await as('root').post('/api/v1/product-transfers/exports', {
      format: 'xlsx',
      filters: { status: 'active' },
    });
    expect(start.status).toBe(202);
    const done = await job('root', start.body.data.id);
    expect(done).toMatchObject({
      status: 'done',
      downloadable: true,
      counts: { products: 1, rows: 2 },
    });

    expect(
      (await as('catalog').get(`/api/v1/product-transfers/jobs/${done.id}/download`)).status,
    ).toBe(404);
    const file = await as('root')
      .get(`/api/v1/product-transfers/jobs/${done.id}/download`)
      .buffer(true)
      .parse(binary);
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toMatch(
      /attachment; filename="products-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body);
    const sheet = wb.worksheets[0];
    const header = sheet.getRow(1).values.slice(1);
    const priceCol = header.indexOf('price') + 1;
    expect([
      sheet.getRow(2).getCell(priceCol).value,
      sheet.getRow(3).getCell(priceCol).value,
    ]).toEqual(['49.00', '49.50']);

    // Round trip: the export re-imports (dry run) with no errors, as updates.
    const again = await as('root').upload(file.body, 'export.xlsx', { dryRun: true });
    expect(await job('root', again.body.data.id)).toMatchObject({
      status: 'done',
      format: 'xlsx',
      errorCount: 0,
      counts: { updated: 1 },
    });
    expect((await as('cashier').post('/api/v1/product-transfers/exports', {})).status).toBe(403);
  });
});
