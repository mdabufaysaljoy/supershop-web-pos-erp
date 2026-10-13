import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { getGlossary } from '../../i18n/glossary.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { setBrandUsageCounter } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
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
  const res = await as('catalog').post('/api/v1/brands', body);
  if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const glossaryTerms = async () => (await getGlossary()).terms.map((t) => t.term);

beforeEach(async () => {
  jobs.length = 0;
  setTranslationScheduler(async (job) => jobs.push(job));
  setBrandUsageCounter(async () => 0);
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
});

describe('brands', () => {
  it('creates with auto slug, unique names (case-insensitive), translation for description only', async () => {
    const b = await create({
      name: 'Nike Pro',
      description: 'Sportswear and shoes',
      website: 'https://nike.example',
    });
    expect(b).toMatchObject({
      name: 'Nike Pro',
      slug: 'nike-pro',
      isActive: true,
      protectName: true,
      website: 'https://nike.example',
      description: { en: 'Sportswear and shoes' },
    });
    expect(jobs[0].items.map((i) => i.field)).toEqual(['description']);

    const dup = await as('catalog').post('/api/v1/brands', { name: 'nike pro' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'NAME_TAKEN', details: [{ path: 'name' }] });
    const slug = await as('catalog').post('/api/v1/brands', { name: 'Other', slug: 'nike-pro' });
    expect(slug.body.error.code).toBe('SLUG_TAKEN');
    const badUrl = await as('catalog').post('/api/v1/brands', {
      name: 'X',
      website: 'javascript:alert(1)',
    });
    expect(badUrl.status).toBe(400);
  });

  it('protects brand names in the translation glossary unless switched off', async () => {
    await create({ name: 'Zentrix' });
    await waitFor(async () => (await glossaryTerms()).includes('Zentrix'));
    const apple = await create({ name: 'Apple', protectName: false }); // common word: "apple juice"
    await new Promise((r) => setTimeout(r, 50));
    expect(await glossaryTerms()).not.toContain('Apple');

    // Turning it on later adds it; an existing glossary entry is never overwritten.
    await as('catalog').patch(`/api/v1/brands/${apple.id}`, { protectName: true });
    await waitFor(async () => (await glossaryTerms()).includes('Apple'));
    const audit = await as('root').get('/api/v1/audit?action=glossary.updated');
    await waitFor(async () => {
      const res = await as('root').get('/api/v1/audit?action=glossary.updated');
      return res.body.data.length === 2;
    });
    expect(audit.status).toBe(200);
  });

  it('updates, clears website, lists with search/sort/pagination', async () => {
    const a = await create({ name: 'Adidas', website: 'https://a.example' });
    await create({ name: 'Puma' });
    await create({ name: 'asics' });
    const upd = await as('catalog').patch(`/api/v1/brands/${a.id}`, {
      website: '',
      isActive: false,
      seo: { title: 'Adidas shoes' },
    });
    expect(upd.body.data).toMatchObject({
      website: null,
      isActive: false,
      seo: { title: { en: 'Adidas shoes' } },
    });
    const list = await as('cashier').get('/api/v1/brands?limit=2');
    expect(list.body.data.map((b) => b.name)).toEqual(['Adidas', 'asics']); // case-insensitive A–Z
    expect(list.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
    const search = await as('catalog').get('/api/v1/brands?q=PU');
    expect(search.body.data.map((b) => b.name)).toEqual(['Puma']);
  });

  it('delete: blocked while products use it; name reusable afterwards', async () => {
    const b = await create({ name: 'Sony' });
    setBrandUsageCounter(async () => 2);
    expect((await as('catalog').delete(`/api/v1/brands/${b.id}`)).body.error.code).toBe(
      'BRAND_IN_USE',
    );
    setBrandUsageCounter(async () => 0);
    expect((await as('catalog').delete(`/api/v1/brands/${b.id}`)).status).toBe(204);
    expect((await as('catalog').get(`/api/v1/brands/${b.id}`)).status).toBe(404);
    expect((await create({ name: 'Sony' })).slug).toBe('sony');
  });

  it('permissions and the public list', async () => {
    expect((await request(app).get('/api/v1/brands')).status).toBe(401);
    expect((await as('cashier').post('/api/v1/brands', { name: 'X' })).status).toBe(403);
    await create({ name: 'Visible', description: 'Shown' });
    await create({ name: 'Hidden', isActive: false });
    const pub = await request(app).get('/api/v1/brands/public?lang=ar');
    expect(pub.status).toBe(200);
    expect(pub.body.meta).toEqual({ lang: 'ar' });
    expect(pub.body.data).toEqual([
      expect.objectContaining({ name: 'Visible', slug: 'visible', description: 'Shown' }),
    ]);
    expect(pub.body.data[0]).not.toHaveProperty('protectName');
  });
});
