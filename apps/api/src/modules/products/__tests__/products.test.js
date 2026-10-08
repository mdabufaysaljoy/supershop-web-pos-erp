import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeAr } from '../../../../test/fakeArabic.js';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { processTranslationJob } from '../../i18n/i18n.jobs.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { setTranslationProviderOverride } from '../../i18n/translate.service.js';
import { Media } from '../../media/media.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { Product, Variant } from '../product.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
const tokens = {};
let jobs = [];
const ref = {};

const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const mediaDoc = (n) =>
  Media.create({
    name: `img${n}.png`,
    mime: 'image/webp',
    sourceFormat: 'png',
    width: 100,
    height: 100,
    bytes: 10,
    originalBytes: 10,
    sha256: `hash-${n}-${Math.random()}`,
    variants: [{ name: 'full', key: `t/img${n}-full.webp`, width: 100, height: 100, bytes: 10 }],
  }).then((m) => String(m._id));

const TSHIRT = () => ({
  name: 'Cotton T-Shirt',
  categoryIds: [ref.category],
  brandId: ref.brand,
  supplierId: ref.supplier,
  imageIds: [ref.img1, ref.img2],
  options: [
    { name: 'Color', values: [{ label: 'Red', swatch: '#FF0000' }, { label: 'Navy Blue' }] },
    { name: 'Size', values: [{ label: 'M' }, { label: 'L' }] },
  ],
  variants: [
    {
      sku: 'ts-red-m',
      optionValues: { color: 'red', size: 'm' },
      price: 4900,
      imageIds: [ref.img1],
    },
    {
      sku: 'TS-RED-L',
      optionValues: { color: 'red', size: 'l' },
      price: 5200,
      compareAtPrice: 6000,
    },
    {
      sku: 'TS-NAVY-M',
      optionValues: { color: 'navy-blue', size: 'm' },
      price: 4900,
      barcode: '6281000000017',
    },
  ],
});
const create = async (body, who = 'root') => {
  const res = await as(who).post('/api/v1/products', body);
  if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const errorPaths = (res) => res.body.error.details?.map((d) => d.path) ?? [];

beforeEach(async () => {
  jobs = [];
  setTranslationScheduler(async (job) => jobs.push(job));
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
  ref.category = (await as('root').post('/api/v1/categories', { name: 'Men' })).body.data.id;
  ref.brand = (await as('root').post('/api/v1/brands', { name: 'Zentra' })).body.data.id;
  ref.supplier = (
    await as('root').post('/api/v1/suppliers', { name: 'Gulf Textiles' })
  ).body.data.id;
  ref.img1 = await mediaDoc(1);
  ref.img2 = await mediaDoc(2);
  jobs = [];
});
afterAll(() => setTranslationProviderOverride(null));

describe('products: create', () => {
  it('simple product gets one default variant; slug, price range and translation jobs', async () => {
    const p = await create({
      name: 'Basmati Rice 5kg',
      description: 'Long grain rice',
      variants: [{ sku: 'rice-5kg', price: 3450 }],
    });
    expect(p).toMatchObject({
      slug: 'basmati-rice-5kg',
      status: 'draft',
      taxCategory: 'standard',
      priceMin: 3450,
      priceMax: 3450,
      variantCount: 1,
      options: [],
    });
    expect(p.variants).toEqual([
      expect.objectContaining({ sku: 'RICE-5KG', optionValues: {}, price: 3450, cost: null }),
    ]);
    expect(jobs[0].items.map((i) => i.field).sort()).toEqual(['description', 'name']);
  });

  it('variants combine options; keys derived; option names/values queued for translation', async () => {
    const p = await create(TSHIRT());
    expect(p.options.map((o) => [o.key, o.values.map((v) => v.key)])).toEqual([
      ['color', ['red', 'navy-blue']],
      ['size', ['m', 'l']],
    ]);
    expect(p.options[0].values[0].swatch).toBe('#ff0000');
    expect(p).toMatchObject({ priceMin: 4900, priceMax: 5200, variantCount: 3 });
    expect(p.variants.map((v) => v.sku)).toEqual(['TS-RED-M', 'TS-RED-L', 'TS-NAVY-M']);
    expect(p.images.map((i) => i.id)).toEqual([ref.img1, ref.img2]);
    const fields = jobs[0].items.map((i) => i.field);
    expect(fields).toEqual(
      expect.arrayContaining(['name', 'options.0.name', 'options.1.values.1.label']),
    );
  });

  it('rejects broken aggregates with field paths', async () => {
    const body = TSHIRT();
    body.variants[0].optionValues = { color: 'green', size: 'm' }; // unknown value
    body.variants[1].optionValues = { color: 'red' }; // missing size
    body.variants[2].optionValues = { color: 'red', size: 'l' }; // fine but…
    body.variants.push({ sku: 'DUP', optionValues: { color: 'red', size: 'l' }, price: 1 }); // duplicate combo
    body.variants[1].compareAtPrice = 100; // ≤ price
    body.variants[2].imageIds = ['64b000000000000000000099']; // not in gallery
    const res = await as('root').post('/api/v1/products', body);
    expect(res.status).toBe(400);
    expect(errorPaths(res)).toEqual(
      expect.arrayContaining([
        'variants.0.optionValues',
        'variants.1.optionValues',
        'variants.1.compareAtPrice',
        'variants.2.imageIds',
        'variants.3.optionValues',
      ]),
    );
    const two = await as('root').post('/api/v1/products', {
      name: 'X',
      variants: [
        { sku: 'A1', price: 1 },
        { sku: 'A2', price: 1 },
      ],
    });
    expect(errorPaths(two)).toContain('variants');
    const badRefs = await as('root').post('/api/v1/products', {
      name: 'X',
      categoryIds: ['64b000000000000000000001'],
      brandId: '64b000000000000000000002',
      supplierId: '64b000000000000000000003',
      imageIds: ['64b000000000000000000004'],
      variants: [{ sku: 'A1', price: 1 }],
    });
    expect(errorPaths(badRefs)).toEqual(['categoryIds.0', 'brandId', 'supplierId', 'imageIds.0']);
    const negative = await as('root').post('/api/v1/products', {
      name: 'X',
      variants: [{ sku: 'A1', price: 19.99 }],
    });
    expect(errorPaths(negative)).toContain('variants.0.price');
  });

  it('SKUs and barcodes are unique across products', async () => {
    await create(TSHIRT());
    const sku = await as('root').post('/api/v1/products', {
      name: 'Other',
      variants: [{ sku: 'ts-red-m', price: 1 }],
    });
    expect(sku.status).toBe(409);
    expect(sku.body.error).toMatchObject({
      code: 'SKU_TAKEN',
      details: [{ path: 'variants.0.sku' }],
    });
    const bc = await as('root').post('/api/v1/products', {
      name: 'Other',
      variants: [{ sku: 'NEW', barcode: '6281000000017', price: 1 }],
    });
    expect(bc.body.error.code).toBe('BARCODE_TAKEN');
  });

  it('cost prices need product.viewCost to write and to read', async () => {
    const denied = await as('catalog').post('/api/v1/products', {
      name: 'X',
      variants: [{ sku: 'C1', price: 1000, cost: 600 }],
    });
    expect(denied.status).toBe(403);
    const p = await create({ name: 'X', variants: [{ sku: 'C1', price: 1000, cost: 600 }] });
    expect(p.variants[0].cost).toBe(600);
    const seen = await as('catalog').get(`/api/v1/products/${p.id}`);
    expect(seen.body.data.variants[0]).not.toHaveProperty('cost');

    // Catalog editor changes the price without sending cost → cost kept.
    const upd = await as('catalog').patch(`/api/v1/products/${p.id}`, {
      variants: [{ id: p.variants[0].id, sku: 'C1', price: 1200 }],
    });
    expect(upd.status).toBe(200);
    expect((await Variant.findById(p.variants[0].id).lean()).cost).toBe(600);
  });
});

describe('products: update', () => {
  it('replaces the variant set: update, add, remove; price changes audited; removed SKU reusable', async () => {
    const p = await create(TSHIRT());
    const [redM, redL] = p.variants;
    const res = await as('root').patch(`/api/v1/products/${p.id}`, {
      status: 'active',
      variants: [
        { id: redM.id, sku: redM.sku, optionValues: redM.optionValues, price: 4500, cost: 2000 },
        {
          id: redL.id,
          sku: redL.sku,
          optionValues: redL.optionValues,
          price: 5200,
          compareAtPrice: 6000,
        },
        { sku: 'TS-NAVY-L', optionValues: { color: 'navy-blue', size: 'l' }, price: 5300 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'active',
      priceMin: 4500,
      priceMax: 5300,
      variantCount: 3,
    });
    expect(res.body.data.variants.map((v) => v.sku)).toEqual(['TS-RED-M', 'TS-RED-L', 'TS-NAVY-L']);
    expect(await Variant.countDocuments({ productId: p.id, deletedAt: { $ne: null } })).toBe(1);

    await waitFor(async () => {
      const audit = await as('root').get('/api/v1/audit?action=product.priceChanged');
      return audit.body.data?.length === 1;
    });
    const audit = await as('root').get('/api/v1/audit?action=product.priceChanged');
    expect(audit.body.data[0].data.changes).toEqual([
      expect.objectContaining({
        sku: 'TS-RED-M',
        before: { price: 4900, compareAtPrice: null, cost: null },
        after: { price: 4500, compareAtPrice: null, cost: 2000 },
      }),
    ]);
    // The removed variant's SKU and barcode are free again.
    expect(
      (
        await create({
          name: 'Navy',
          variants: [{ sku: 'TS-NAVY-M', barcode: '6281000000017', price: 1 }],
        })
      ).variants,
    ).toHaveLength(1);
  });

  it('swapping SKUs between two variants works; unknown variant ids are rejected', async () => {
    const p = await create(TSHIRT());
    const [a, b, c] = p.variants;
    const swap = await as('root').patch(`/api/v1/products/${p.id}`, {
      variants: [
        { id: a.id, sku: b.sku, optionValues: a.optionValues, price: a.price },
        { id: b.id, sku: a.sku, optionValues: b.optionValues, price: b.price },
        { id: c.id, sku: c.sku, optionValues: c.optionValues, price: c.price },
      ],
    });
    expect(swap.status).toBe(200);
    expect(swap.body.data.variants.map((v) => v.sku)).toEqual([
      'TS-RED-L',
      'TS-RED-M',
      'TS-NAVY-M',
    ]);
    const foreign = await as('root').patch(`/api/v1/products/${p.id}`, {
      variants: [
        { id: '64b000000000000000000042', sku: 'Z', optionValues: a.optionValues, price: 1 },
      ],
    });
    expect(errorPaths(foreign)).toEqual(['variants.0.id']);
  });

  it('concurrent edits keep the product consistent with its variants', async () => {
    for (let round = 0; round < 3; round += 1) {
      const p = await create({
        ...TSHIRT(),
        variants: TSHIRT().variants.map((v) => ({
          ...v,
          sku: `${v.sku}-${round}`,
          barcode: undefined,
        })),
      });
      const [a, b, c] = p.variants;
      const keep = (v, price) => ({ id: v.id, sku: v.sku, optionValues: v.optionValues, price });
      const results = await Promise.all([
        as('root').patch(`/api/v1/products/${p.id}`, { variants: [keep(a, 1000), keep(b, 2000)] }),
        as('root').patch(`/api/v1/products/${p.id}`, {
          variants: [keep(a, 3000), keep(b, 4000), keep(c, 500)],
        }),
      ]);
      expect(results.map((r) => r.status).every((s) => s === 200 || s === 400)).toBe(true);
      const stored = await Product.findById(p.id).lean();
      const live = await Variant.find({ productId: p.id, deletedAt: null }).lean();
      const prices = live.map((v) => v.price);
      expect(stored.variantCount).toBe(live.length);
      expect([stored.priceMin, stored.priceMax]).toEqual([
        Math.min(...prices),
        Math.max(...prices),
      ]);
    }
  });

  it('validates the merged aggregate and keeps translations of unchanged option labels', async () => {
    const p = await create(TSHIRT());
    // Removing an option without sending new variants would orphan the stored combinations.
    const orphan = await as('root').patch(`/api/v1/products/${p.id}`, {
      options: [{ key: 'color', name: 'Color', values: [{ key: 'red', label: 'Red' }] }],
    });
    expect(orphan.status).toBe(400);

    await Product.updateOne(
      { _id: p.id },
      {
        $set: {
          'options.0.values.0.label.ar': fakeAr('Red'),
          'options.0.values.0.label.meta.ar': { mode: 'auto', status: 'done', srcHash: 'x' },
        },
      },
    );
    const opts = TSHIRT().options.map((o, i) => ({
      ...o,
      key: p.options[i].key,
      values: o.values.map((v, j) => ({ ...v, key: p.options[i].values[j].key })),
    }));
    opts[1].values[1].label = 'Large';
    const res = await as('root').patch(`/api/v1/products/${p.id}`, { options: opts });
    expect(res.status).toBe(200);
    expect(res.body.data.options[0].values[0].label.ar).toBe(fakeAr('Red'));
    expect(res.body.data.options[1].values[1].label.en).toBe('Large');
  });

  it('translation jobs fill option labels (wildcard paths) end to end', async () => {
    setTranslationProviderOverride({
      name: 'fake',
      enabled: true,
      translateBatch: async (texts) => texts.map(fakeAr),
    });
    const p = await create({ ...TSHIRT(), status: 'active' });
    for (const job of jobs.splice(0)) await processTranslationJob(job);
    const stored = await Product.findById(p.id).lean();
    expect(stored.options[0].values[1].label.ar).toBe(fakeAr('Navy Blue'));
    expect(stored.options[1].name.meta.ar.status).toBe('done');

    const pub = await request(app).get(`/api/v1/products/public/${p.slug}?lang=ar`);
    expect(pub.body.data.name).toBe(fakeAr('Cotton T-Shirt'));
    expect(pub.body.data.options[0]).toMatchObject({
      key: 'color',
      name: fakeAr('Color'),
      values: [
        { key: 'red', label: fakeAr('Red'), swatch: '#ff0000' },
        { key: 'navy-blue', label: fakeAr('Navy Blue'), swatch: null },
      ],
    });
  });
});

describe('products: custom fields', () => {
  it('validates values against definitions; public view shows public fields only', async () => {
    const def = (body) => as('root').post('/api/v1/custom-fields', { entity: 'product', ...body });
    expect(
      (
        await def({
          key: 'material',
          type: 'select',
          label: 'Material',
          required: true,
          visibility: 'public',
          options: [
            { key: 'cotton', label: 'Cotton' },
            { key: 'linen', label: 'Linen' },
          ],
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await def({
          key: 'warranty_months',
          type: 'number',
          label: 'Warranty (months)',
          min: 0,
          max: 60,
          visibility: 'public',
        })
      ).status,
    ).toBe(201);
    const internal = (await def({ key: 'shelf', type: 'text', label: 'Shelf code', max: 10 })).body
      .data;

    const missing = await as('root').post('/api/v1/products', {
      name: 'Shirt',
      variants: [{ sku: 'S1', price: 1 }],
    });
    expect(errorPaths(missing)).toEqual(['customFields.material']);
    const bad = await as('root').post('/api/v1/products', {
      name: 'Shirt',
      customFields: { material: 'silk', warranty_months: 99, shelf: 'A-1-LONG-CODE' },
      variants: [{ sku: 'S1', price: 1 }],
    });
    expect(errorPaths(bad).sort()).toEqual([
      'customFields.material',
      'customFields.shelf',
      'customFields.warranty_months',
    ]);

    const p = await create({
      name: 'Shirt',
      status: 'active',
      customFields: { material: 'linen', warranty_months: 12, shelf: 'A1', unknown: 'x' },
      variants: [{ sku: 'S1', price: 1 }],
    });
    expect(p.customFields).toEqual({ material: 'linen', warranty_months: 12, shelf: 'A1' });
    const pub = await request(app).get(`/api/v1/products/public/${p.slug}`);
    expect(pub.body.data.attributes).toEqual([
      { key: 'material', type: 'select', label: 'Material', value: 'Linen' },
      { key: 'warranty_months', type: 'number', label: 'Warranty (months)', value: 12 },
    ]);

    // Disabling a field keeps its stored value; deleting reserves the key.
    await as('root').patch(`/api/v1/custom-fields/${internal.id}`, { isActive: false });
    const upd = await as('root').patch(`/api/v1/products/${p.id}`, {
      customFields: { material: 'cotton' },
    });
    expect(upd.body.data.customFields).toEqual({ material: 'cotton', shelf: 'A1' });
    await as('root').delete(`/api/v1/custom-fields/${internal.id}`);
    expect((await def({ key: 'shelf', type: 'number', label: 'Again' })).status).toBe(409);
  });

  it('custom field definitions: permissions and rules', async () => {
    expect((await as('cashier').get('/api/v1/custom-fields?entity=product')).status).toBe(200);
    expect(
      (
        await as('catalog').post('/api/v1/custom-fields', {
          entity: 'product',
          key: 'x',
          type: 'text',
          label: 'X',
        })
      ).status,
    ).toBe(403);
    const noOptions = await as('root').post('/api/v1/custom-fields', {
      entity: 'product',
      key: 'size_chart',
      type: 'select',
      label: 'Chart',
    });
    expect(errorPaths(noOptions)).toContain('options');
    const badKey = await as('root').post('/api/v1/custom-fields', {
      entity: 'product',
      key: 'Bad Key',
      type: 'text',
      label: 'X',
    });
    expect(badKey.status).toBe(400);
  });
});

describe('products: listing, public, deletion & references', () => {
  it('lists with search by name/SKU/barcode, filters and sort', async () => {
    await create(TSHIRT());
    await create({
      name: 'Basmati Rice',
      status: 'active',
      variants: [{ sku: 'RICE', price: 3000 }],
    });
    const all = await as('cashier').get('/api/v1/products?sort=priceMin');
    expect(all.body.data.map((p) => p.name.en)).toEqual(['Basmati Rice', 'Cotton T-Shirt']);
    expect(all.body.data[1]).toMatchObject({
      variantCount: 3,
      image: expect.objectContaining({ id: ref.img1 }),
    });
    const search = async (q) =>
      (await as('cashier').get(`/api/v1/products?q=${q}`)).body.data.map((p) => p.name.en);
    for (const q of ['cotton', 'ts-navy', '628100000001'])
      expect(await search(q)).toEqual(['Cotton T-Shirt']);
    expect(await search('rice')).toEqual(['Basmati Rice']);
    expect(await search('.*')).toEqual([]);
    expect((await as('cashier').get('/api/v1/products?status=active')).body.meta.total).toBe(1);
    expect(
      (await as('cashier').get(`/api/v1/products?categoryId=${ref.category}`)).body.meta.total,
    ).toBe(1);
    expect(
      (
        await as('cashier').post('/api/v1/products', {
          name: 'X',
          variants: [{ sku: 'A', price: 1 }],
        })
      ).status,
    ).toBe(403);
  });

  it('public view: active only, no cost/supplier, inactive variants hidden', async () => {
    const p = await create(TSHIRT());
    expect((await request(app).get(`/api/v1/products/public/${p.slug}`)).status).toBe(404);
    const v = p.variants;
    await as('root').patch(`/api/v1/products/${p.id}`, {
      status: 'active',
      variants: v.map((x, i) => ({
        id: x.id,
        sku: x.sku,
        optionValues: x.optionValues,
        price: x.price,
        cost: 100,
        isActive: i !== 2,
      })),
    });
    const pub = await request(app).get(`/api/v1/products/public/${p.slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.brand).toMatchObject({ name: 'Zentra' });
    expect(pub.body.data.variants).toHaveLength(2);
    const text = JSON.stringify(pub.body.data);
    expect(text).not.toContain('cost');
    expect(text).not.toContain('supplier');
    expect(text).not.toContain('6281000000017');
  });

  it('referenced categories/brands/suppliers cannot be deleted until the product is', async () => {
    const p = await create(TSHIRT());
    expect((await as('root').delete(`/api/v1/categories/${ref.category}`)).body.error.code).toBe(
      'CATEGORY_IN_USE',
    );
    expect((await as('root').delete(`/api/v1/brands/${ref.brand}`)).body.error.code).toBe(
      'BRAND_IN_USE',
    );
    expect((await as('root').delete(`/api/v1/suppliers/${ref.supplier}`)).body.error.code).toBe(
      'SUPPLIER_IN_USE',
    );
    expect((await as('catalog').delete(`/api/v1/products/${p.id}`)).status).toBe(403); // no product.delete
    expect((await as('root').delete(`/api/v1/products/${p.id}`)).status).toBe(204);
    expect(await Variant.countDocuments({ productId: p.id, deletedAt: null })).toBe(0);
    expect((await as('root').delete(`/api/v1/brands/${ref.brand}`)).status).toBe(204);
    expect((await as('root').get(`/api/v1/products/${p.id}`)).status).toBe(404);
  });
});
