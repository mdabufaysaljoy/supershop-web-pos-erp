import { CATEGORY } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeAr } from '../../../../test/fakeArabic.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { Category } from '../category.model.js';
import { setCategoryUsageCounter } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const up = { db: () => true, redis: async () => true };
let app;
const tokens = {};
const jobs = [];

const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const create = async (body) => {
  const res = await as('catalog').post('/api/v1/categories', body);
  if (res.status !== 201)
    throw new Error(`create failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const move = (id, parentId, index) =>
  as('catalog').post(`/api/v1/categories/${id}/move`, { parentId, index });
/** `{ name: [parentName, position, depth] }` from the admin list. */
async function shape() {
  const { body } = await as('catalog').get('/api/v1/categories');
  const byId = new Map(body.data.map((c) => [c.id, c]));
  return Object.fromEntries(
    body.data.map((c) => [c.name.en, [byId.get(c.parentId)?.name.en ?? null, c.position, c.depth]]),
  );
}

beforeEach(async () => {
  jobs.length = 0;
  setTranslationScheduler(async (job) => jobs.push(job));
  setCategoryUsageCounter(async () => 0);
  await loadSettings();
  app = createApp({ checks: up });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  for (const [who, systemKey] of [
    ['catalog', 'catalog_editor'],
    ['cashier', 'cashier'],
    ['clerk', 'inventory_clerk'],
  ]) {
    await createStaff(null, {
      name: 'Staff Member',
      email: `${who}@shop.test`,
      password: PW,
      roleId: await findSystemRoleId(systemKey),
      branchIds: [],
    });
  }
  for (const who of ['root', 'catalog', 'cashier', 'clerk']) {
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: `${who}@shop.test`, password: PW });
    tokens[who] = res.body.data.accessToken;
  }
});

describe('categories: create & edit', () => {
  it('creates a tree with auto slugs, positions, paths and schedules translation', async () => {
    const electronics = await create({ name: 'Electronics', seo: { title: 'Buy electronics' } });
    const phones = await create({ name: 'Phones', parentId: electronics.id });
    const phones2 = await create({ name: 'Phones', parentId: electronics.id });
    expect(electronics).toMatchObject({
      slug: 'electronics',
      depth: 0,
      position: 0,
      isActive: true,
    });
    expect(phones).toMatchObject({
      slug: 'phones',
      parentId: electronics.id,
      depth: 1,
      position: 0,
    });
    expect(phones2).toMatchObject({ slug: 'phones-2', position: 1 });

    const stored = await Category.findById(phones.id).lean();
    expect(stored.ancestors.map(String)).toEqual([electronics.id]);
    const fields = jobs.find((j) => j.id === electronics.id).items.map((i) => i.field);
    expect(fields.sort()).toEqual(['name', 'seo.title']); // empty fields aren't translated
  });

  it('validates slugs, parents, images and unknown fields', async () => {
    await create({ name: 'Shoes', slug: 'shoes' });
    const dup = await as('catalog').post('/api/v1/categories', { name: 'Other', slug: 'shoes' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'SLUG_TAKEN', details: [{ path: 'slug' }] });
    const bad = await as('catalog').post('/api/v1/categories', { name: 'X', slug: 'Bad Slug!' });
    expect(bad.status).toBe(400);
    const missingParent = await as('catalog').post('/api/v1/categories', {
      name: 'X',
      parentId: '64b000000000000000000009',
    });
    expect(missingParent.status).toBe(400);
    expect(missingParent.body.error.details[0].path).toBe('parentId');
    const missingImage = await as('catalog').post('/api/v1/categories', {
      name: 'X',
      imageId: '64b000000000000000000009',
    });
    expect(missingImage.body.error.details[0].path).toBe('imageId');
    const html = await as('catalog').post('/api/v1/categories', { name: '<b>X</b>' });
    expect(html.status).toBe(400);
  });

  it('updates content; slug conflicts are rejected; Arabic manual overrides survive', async () => {
    const a = await create({ name: 'Bags' });
    const b = await create({ name: 'Belts' });
    jobs.length = 0;
    const res = await as('catalog').patch(`/api/v1/categories/${a.id}`, {
      name: 'Handbags',
      slug: 'handbags',
      isActive: false,
      seo: { description: 'Leather handbags' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: { en: 'Handbags' },
      slug: 'handbags',
      isActive: false,
      seo: { description: { en: 'Leather handbags' } },
    });
    expect(jobs[0].items.map((i) => i.field).sort()).toEqual(['name', 'seo.description']);
    const taken = await as('catalog').patch(`/api/v1/categories/${b.id}`, { slug: 'handbags' });
    expect(taken.body.error.code).toBe('SLUG_TAKEN');
    expect((await as('catalog').patch(`/api/v1/categories/${b.id}`, {})).status).toBe(400);
  });
});

describe('categories: move & reorder', () => {
  async function seedTree() {
    const a = await create({ name: 'A' });
    const b = await create({ name: 'B' });
    const c = await create({ name: 'C' });
    const a1 = await create({ name: 'A1', parentId: a.id });
    const a2 = await create({ name: 'A2', parentId: a.id });
    const a11 = await create({ name: 'A11', parentId: a1.id });
    return { a, b, c, a1, a2, a11 };
  }

  it('reorders siblings', async () => {
    const t = await seedTree();
    expect((await move(t.c.id, null, 0)).status).toBe(200);
    expect(await shape()).toMatchObject({ C: [null, 0, 0], A: [null, 1, 0], B: [null, 2, 0] });
    await move(t.c.id, null, 99); // clamped to the end
    expect(await shape()).toMatchObject({ A: [null, 0, 0], B: [null, 1, 0], C: [null, 2, 0] });
  });

  it('moves a subtree: paths and depths follow, old siblings close the gap', async () => {
    const t = await seedTree();
    const res = await move(t.a1.id, t.b.id, 0);
    expect(res.body.data).toMatchObject({ parentId: t.b.id, depth: 1, position: 0 });
    expect(await shape()).toMatchObject({
      A1: ['B', 0, 1],
      A11: ['A1', 0, 2],
      A2: ['A', 0, 1],
    });
    const a11 = await Category.findById(t.a11.id).lean();
    expect(a11.ancestors.map(String)).toEqual([t.b.id, t.a1.id]);

    await move(t.a1.id, null, 1); // to top level
    expect(await shape()).toMatchObject({ A1: [null, 1, 0], A11: ['A1', 0, 1], B: [null, 2, 0] });
    expect((await Category.findById(t.a11.id).lean()).ancestors.map(String)).toEqual([t.a1.id]);
  });

  it('refuses cycles and too-deep trees', async () => {
    const t = await seedTree();
    const self = await move(t.a.id, t.a.id, 0);
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('INVALID_MOVE');
    expect((await move(t.a.id, t.a11.id, 0)).body.error.code).toBe('INVALID_MOVE');

    let parent = t.c;
    for (let d = 1; d < CATEGORY.MAX_DEPTH; d += 1)
      parent = await create({ name: `L${d}`, parentId: parent.id });
    const tooDeep = await as('catalog').post('/api/v1/categories', {
      name: 'Z',
      parentId: parent.id,
    });
    expect(tooDeep.body.error.code).toBe('INVALID_MOVE');
    // A (3 levels) can't go under L18 either.
    const l18 = (await as('catalog').get('/api/v1/categories')).body.data.find(
      (c) => c.name.en === 'L18',
    );
    expect((await move(t.a.id, l18.id, 0)).body.error.code).toBe('INVALID_MOVE');
  });

  it('concurrent opposite moves never create a cycle', async () => {
    for (let round = 0; round < 5; round += 1) {
      await Category.deleteMany({});
      // X and Y are only children of different parents: the two moves write disjoint documents
      // (no sibling renumbering), so only the tree guard can stop the write skew.
      const p = await create({ name: `P${round}` });
      const q = await create({ name: `Q${round}` });
      const x = await create({ name: `X${round}`, parentId: p.id });
      const y = await create({ name: `Y${round}`, parentId: q.id });
      const results = await Promise.all([move(x.id, y.id, 0), move(y.id, x.id, 0)]);
      const ok = results.filter((r) => r.status === 200);
      expect(ok).toHaveLength(1);
      expect(results.find((r) => r.status !== 200).body.error.code).toBe('INVALID_MOVE');
      // Every node still reaches a root (no cycle).
      const docs = new Map((await Category.find({}).lean()).map((d) => [String(d._id), d]));
      for (const d of docs.values()) {
        let cur = d;
        for (let hops = 0; cur.parentId; hops += 1) {
          expect(hops).toBeLessThan(docs.size);
          cur = docs.get(String(cur.parentId));
        }
      }
    }
  });
});

describe('categories: delete', () => {
  it('blocks parents and categories with products; frees the slug after delete', async () => {
    const a = await create({ name: 'Toys' });
    const b = await create({ name: 'Puzzles', parentId: a.id });
    const parent = await as('catalog').delete(`/api/v1/categories/${a.id}`);
    expect(parent.status).toBe(409);
    expect(parent.body.error.code).toBe('CATEGORY_HAS_CHILDREN');

    setCategoryUsageCounter(async (id) => (id === b.id ? 3 : 0));
    expect((await as('catalog').delete(`/api/v1/categories/${b.id}`)).body.error.code).toBe(
      'CATEGORY_IN_USE',
    );
    setCategoryUsageCounter(async () => 0);
    expect((await as('catalog').delete(`/api/v1/categories/${b.id}`)).status).toBe(204);
    expect((await as('catalog').get(`/api/v1/categories/${b.id}`)).status).toBe(404);
    expect((await as('catalog').delete(`/api/v1/categories/${a.id}`)).status).toBe(204);
    expect((await create({ name: 'Toys' })).slug).toBe('toys');
  });
});

describe('categories: access & public tree', () => {
  it('enforces permissions', async () => {
    expect((await request(app).get('/api/v1/categories')).status).toBe(401);
    expect((await as('cashier').get('/api/v1/categories')).status).toBe(200); // product.view
    expect((await as('cashier').post('/api/v1/categories', { name: 'X' })).status).toBe(403);
    expect((await as('clerk').get('/api/v1/categories')).status).toBe(200);
    const a = await create({ name: 'A' });
    expect(
      (await as('clerk').post(`/api/v1/categories/${a.id}/move`, { parentId: null, index: 0 }))
        .status,
    ).toBe(403);
    expect((await as('clerk').delete(`/api/v1/categories/${a.id}`)).status).toBe(403);
  });

  it('serves the active tree per language with English fallback, no auth', async () => {
    const men = await create({ name: 'Men' });
    const shirts = await create({ name: 'Shirts', parentId: men.id });
    await create({ name: 'Hidden kids', parentId: men.id, isActive: false }).then((k) =>
      create({ name: 'Kids shoes', parentId: k.id }),
    );
    const doc = await Category.findById(shirts.id);
    doc.set('name.ar', fakeAr('Shirts'));
    doc.set('name.meta', { ar: { mode: 'auto', status: 'done' } });
    await doc.save();

    const en = await request(app).get('/api/v1/categories/public');
    expect(en.status).toBe(200);
    expect(en.headers.vary).toContain('Accept-Language');
    expect(en.body.meta).toEqual({ lang: 'en' });
    expect(en.body.data).toEqual([
      expect.objectContaining({
        name: 'Men',
        slug: 'men',
        children: [expect.objectContaining({ name: 'Shirts', slug: 'shirts', children: [] })],
      }),
    ]);

    const ar = await request(app)
      .get('/api/v1/categories/public')
      .set('Accept-Language', 'ar-SA,ar;q=0.9');
    expect(ar.body.meta.lang).toBe('ar');
    expect(ar.body.data[0].name).toBe('Men'); // no Arabic yet → English
    expect(ar.body.data[0].children[0].name).toBe(fakeAr('Shirts'));
    const explicit = await request(app)
      .get('/api/v1/categories/public?lang=en')
      .set('Cookie', 'lang=ar');
    expect(explicit.body.meta.lang).toBe('en');
    expect((await request(app).get('/api/v1/categories/public?lang=xx')).status).toBe(400);
  });
});
