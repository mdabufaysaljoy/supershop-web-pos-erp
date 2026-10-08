import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeAr } from '../../../../test/fakeArabic.js';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { processTranslationJob } from '../../i18n/i18n.jobs.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { setTranslationProviderOverride } from '../../i18n/translate.service.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { rebuildIndex } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
let token;
let jobs = [];
const ref = {};
const auth = (r) => r.set('Authorization', `Bearer ${token}`);
const post = (url, body) => auth(request(app).post(url)).send(body);
const search = async (qs) => (await request(app).get(`/api/v1/search?${qs}`)).body;
const names = async (qs) => (await search(qs)).data.map((p) => p.name);
const product = async (body) => {
  const res = await post('/api/v1/products', { status: 'active', ...body });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data;
};
/** Waits until the background index has caught up with `qs` returning `expected` names. */
const expectNames = (qs, expected) =>
  waitFor(async () => JSON.stringify(await names(qs)) === JSON.stringify(expected)).catch(
    async () => {
      expect(await names(qs)).toEqual(expected);
    },
  );

beforeAll(() =>
  setTranslationProviderOverride({
    name: 'fake',
    enabled: true,
    translateBatch: async (t) => t.map(fakeAr),
  }),
);
afterAll(() => setTranslationProviderOverride(null));

beforeEach(async () => {
  jobs = [];
  setTranslationScheduler(async (job) => jobs.push(job));
  await loadSettings();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  token = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW })
  ).body.data.accessToken;
  ref.men = (await post('/api/v1/categories', { name: 'Men' })).body.data.id;
  ref.shirts = (
    await post('/api/v1/categories', { name: 'Shirts', parentId: ref.men })
  ).body.data.id;
  ref.food = (await post('/api/v1/categories', { name: 'Groceries' })).body.data.id;
  ref.zentra = (await post('/api/v1/brands', { name: 'Zentra' })).body.data.id;
  ref.nova = (await post('/api/v1/brands', { name: 'Nova' })).body.data.id;

  await product({
    name: 'Cotton Oxford Shirts',
    categoryIds: [ref.shirts],
    brandId: ref.zentra,
    tags: ['summer'],
    options: [{ name: 'Color', values: [{ label: 'Sky Blue' }, { label: 'White' }] }],
    variants: [
      { sku: 'OX-BLUE', optionValues: { color: 'sky-blue' }, price: 12900 },
      { sku: 'OX-WHITE', optionValues: { color: 'white' }, price: 11900, compareAtPrice: 15900 },
    ],
  });
  await product({
    name: 'Linen Trousers',
    description: 'Pairs well with a cotton shirt',
    categoryIds: [ref.men],
    brandId: ref.nova,
    variants: [{ sku: 'LT-1', price: 19900 }],
  });
  await product({
    name: 'Basmati Rice 5kg',
    categoryIds: [ref.food],
    variants: [{ sku: 'RICE-5', barcode: '6281000000007', price: 3450 }],
  });
  await product({
    name: 'Draft Cotton Shirt',
    status: 'draft',
    variants: [{ sku: 'DR-1', price: 100 }],
  });
});

describe('product search', () => {
  it('ranks name matches above description matches; drafts excluded; plurals and prefixes match', async () => {
    await expectNames('q=cotton%20shirt', ['Cotton Oxford Shirts', 'Linen Trousers']);
    expect(await names('q=shirts')).toEqual(['Cotton Oxford Shirts', 'Linen Trousers']);
    expect(await names('q=oxf')).toEqual(['Cotton Oxford Shirts']); // prefix
    expect(await names('q=SKY%20blue')).toEqual(['Cotton Oxford Shirts']); // option label
    expect(await names('q=zentra')).toEqual(['Cotton Oxford Shirts']); // brand
    expect(await names('q=men')).toEqual(
      expect.arrayContaining(['Cotton Oxford Shirts', 'Linen Trousers']),
    ); // parent category
    expect(await names('q=summer')).toEqual(['Cotton Oxford Shirts']); // tag
    expect(await names('q=6281000000007')).toEqual(['Basmati Rice 5kg']); // barcode
    expect(await names('q=ox-white')).toEqual(['Cotton Oxford Shirts']); // SKU
    // An exact SKU outranks products that merely share its words.
    expect(await names('q=LT-1')).toEqual(['Linen Trousers']);
    expect(await names('q=nothing-like-this')).toEqual([]);
    expect(await names('q=.*')).toEqual([]); // regex-safe
  });

  it('cards carry price range, compare-at of the cheapest variant, brand and slug', async () => {
    await expectNames('q=oxford', ['Cotton Oxford Shirts']);
    const [card] = (await search('q=oxford')).data;
    expect(card).toMatchObject({
      slug: 'cotton-oxford-shirts',
      priceMin: 11900,
      priceMax: 12900,
      compareAtPrice: 15900,
      brand: { name: 'Zentra', slug: 'zentra' },
      variantCount: 2,
    });
  });

  it('filters, sorts, paginates and returns facets', async () => {
    await expectNames('sort=price_asc', [
      'Basmati Rice 5kg',
      'Cotton Oxford Shirts',
      'Linen Trousers',
    ]);
    expect(await names(`categoryId=${ref.men}&sort=price_asc`)).toEqual([
      'Cotton Oxford Shirts',
      'Linen Trousers',
    ]); // subtree
    expect(await names(`brands=${ref.nova},${ref.zentra}&sort=name`)).toEqual([
      'Cotton Oxford Shirts',
      'Linen Trousers',
    ]);
    expect(await names('minPrice=12000&maxPrice=20000&sort=price_asc')).toEqual([
      'Cotton Oxford Shirts',
      'Linen Trousers',
    ]);
    const page2 = await search('sort=price_asc&limit=2&page=2');
    expect(page2.meta).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(page2.data.map((p) => p.name)).toEqual(['Linen Trousers']);

    const { facets } = (await search(`brands=${ref.zentra}`)).meta;
    // Brand facet ignores the brand filter itself (so other brands stay selectable).
    expect(facets.brands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ref.zentra, name: 'Zentra', count: 1 }),
        expect.objectContaining({ id: ref.nova, name: 'Nova', count: 1 }),
      ]),
    );
    expect(facets.categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ref.men, name: 'Men', count: 1 })]),
    );
    expect(facets.price).toEqual({ min: 11900, max: 12900 });
    expect((await request(app).get('/api/v1/search?brands=nope')).status).toBe(400);
    expect((await request(app).get('/api/v1/search?limit=500')).status).toBe(400);
  });

  it('Arabic: translated names are searchable and returned per language', async () => {
    await expectNames('q=oxford', ['Cotton Oxford Shirts']);
    for (const job of jobs.splice(0)) await processTranslationJob(job).catch(() => {});
    const arName = fakeAr('Cotton Oxford Shirts');
    await waitFor(
      async () =>
        (await search(`lang=ar&q=${encodeURIComponent(fakeAr('oxford'))}`)).data.length === 1,
    );
    const res = await search(`lang=ar&q=${encodeURIComponent(fakeAr('oxford'))}`);
    expect(res.meta.lang).toBe('ar');
    expect(res.data[0].name).toBe(arName);
    // Arabic category facet names too.
    expect(res.meta.facets.categories.find((c) => c.id === ref.men).name).toBe(fakeAr('Men'));
  });

  it('stays in sync: delete, rename brand, move category; typeahead', async () => {
    await expectNames('q=rice', ['Basmati Rice 5kg']);
    const [rice] = (await search('q=rice')).data;
    await auth(request(app).delete(`/api/v1/products/${rice.id}`));
    await expectNames('q=rice', []);

    await auth(request(app).patch(`/api/v1/brands/${ref.nova}`)).send({ name: 'Nordic Line' });
    await expectNames('q=nordic', ['Linen Trousers']);

    await post(`/api/v1/categories/${ref.shirts}/move`, { parentId: ref.food, index: 0 });
    await expectNames(`categoryId=${ref.food}`, ['Cotton Oxford Shirts']);

    const suggest = (await request(app).get('/api/v1/search/suggest?q=sh')).body.data;
    expect(suggest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'product',
          text: 'Cotton Oxford Shirts',
          slug: 'cotton-oxford-shirts',
        }),
        expect.objectContaining({ type: 'category', text: 'Shirts' }),
      ]),
    );
    expect((await request(app).get('/api/v1/search/suggest')).status).toBe(400);
  });

  it('rebuild + status are staff-only; rebuild restores a wiped index', async () => {
    expect((await request(app).get('/api/v1/search/status')).status).toBe(401);
    await expectNames('q=linen', ['Linen Trousers']);
    const { getSearchAdapter } = await import('../../../adapters/search/index.js');
    await getSearchAdapter().clear();
    expect(await names('q=linen')).toEqual([]);
    expect((await post('/api/v1/search/rebuild')).status).toBe(202);
    await rebuildIndex();
    expect(await names('q=linen')).toEqual(['Linen Trousers']);
    const status = (await auth(request(app).get('/api/v1/search/status'))).body.data;
    expect(status).toMatchObject({ driver: 'mongo', documents: 4, rebuilding: false });
  });
});
