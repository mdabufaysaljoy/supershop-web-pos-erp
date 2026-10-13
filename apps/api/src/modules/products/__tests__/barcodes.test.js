import { gtinCheckDigit, isValidGtin } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
const tokens = {};
const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const internal = (prefix, n) => {
  const body = `${prefix}${String(n).padStart(10, '0')}`;
  return body + gtinCheckDigit(body);
};

beforeEach(async () => {
  await loadSettings();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  await createStaff(null, {
    name: 'Staff Member',
    email: 'cashier@shop.test',
    password: PW,
    roleId: await findSystemRoleId('cashier'),
    branchIds: [],
  });
  for (const who of ['root', 'cashier']) {
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: `${who}@shop.test`, password: PW });
    tokens[who] = res.body.data.accessToken;
  }
});

describe('barcode generation', () => {
  it('issues unique, valid in-store EAN-13 codes from the configured prefix', async () => {
    const first = await as('root').post('/api/v1/products/barcodes', { count: 3 });
    expect(first.status).toBe(201);
    expect(first.body.data.codes).toEqual([
      internal('20', 1),
      internal('20', 2),
      internal('20', 3),
    ]);
    expect(first.body.data.codes.every(isValidGtin)).toBe(true);

    await as('root').patch('/api/v1/settings', {
      changes: [{ key: 'barcode.internalPrefix', value: '27' }],
    });
    const next = await as('root').post('/api/v1/products/barcodes', {});
    expect(next.body.data.codes).toEqual([internal('27', 4)]); // sequence never restarts
    expect(
      (
        await as('root').patch('/api/v1/settings', {
          changes: [{ key: 'barcode.internalPrefix', value: '30' }],
        })
      ).status,
    ).toBe(400); // only GS1 in-store prefixes 20–29
  });

  it('skips codes already used by products', async () => {
    const used = internal('20', 2);
    const created = await as('root').post('/api/v1/products', {
      name: 'Imported',
      variants: [{ sku: 'IMP-1', barcode: used, price: 100 }],
    });
    expect(created.status).toBe(201);
    const res = await as('root').post('/api/v1/products/barcodes', { count: 3 });
    expect(res.body.data.codes).toHaveLength(3);
    expect(res.body.data.codes).not.toContain(used);
    expect(new Set(res.body.data.codes).size).toBe(3);
  });

  it('validates count and permissions; rejects wrong check digits on save', async () => {
    expect((await as('root').post('/api/v1/products/barcodes', { count: 0 })).status).toBe(400);
    expect((await as('root').post('/api/v1/products/barcodes', { count: 251 })).status).toBe(400);
    expect((await as('cashier').post('/api/v1/products/barcodes', { count: 1 })).status).toBe(403);
    const bad = await as('root').post('/api/v1/products', {
      name: 'Typo',
      variants: [{ sku: 'T-1', barcode: '6281000000000', price: 100 }],
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([
      expect.objectContaining({ path: 'variants.0.barcode', message: 'validation.code.checksum' }),
    ]);
  });
});

describe('scan lookup', () => {
  it('finds a variant by barcode or SKU, normalizing scanner/keyboard input', async () => {
    const p = (
      await as('root').post('/api/v1/products', {
        name: 'Water 330ml',
        options: [{ name: 'Pack', values: [{ label: 'Single' }, { label: 'Six' }] }],
        variants: [
          {
            sku: 'WTR-1',
            barcode: '6281000000007',
            optionValues: { pack: 'single' },
            price: 150,
            cost: 50,
          },
          { sku: 'WTR-6', optionValues: { pack: 'six' }, price: 800 },
        ],
      })
    ).body.data;

    const byBarcode = await as('cashier').get(
      '/api/v1/products/lookup?code=%D9%A6%D9%A2%D9%A8%D9%A1000000007',
    ); // Arabic digits ٦٢٨١…
    expect(byBarcode.status).toBe(200);
    expect(byBarcode.body.data).toMatchObject({
      matchedBy: 'barcode',
      product: { id: p.id, name: { en: 'Water 330ml' } },
      variant: { sku: 'WTR-1', optionValues: { pack: 'single' }, price: 150 },
    });
    expect(byBarcode.body.data.variant).not.toHaveProperty('cost'); // cashier lacks viewCost
    expect(
      (await as('root').get('/api/v1/products/lookup?code=6281000000007')).body.data.variant.cost,
    ).toBe(50);

    const bySku = await as('cashier').get('/api/v1/products/lookup?code=%20wtr-6%20');
    expect(bySku.body.data).toMatchObject({ matchedBy: 'sku', variant: { sku: 'WTR-6' } });

    expect((await as('cashier').get('/api/v1/products/lookup?code=000')).status).toBe(404);
    expect((await as('cashier').get('/api/v1/products/lookup')).status).toBe(400);
    expect((await request(app).get('/api/v1/products/lookup?code=WTR-6')).status).toBe(401);
    await as('root').delete(`/api/v1/products/${p.id}`);
    expect((await as('cashier').get('/api/v1/products/lookup?code=WTR-6')).status).toBe(404);
  });
});
