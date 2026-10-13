import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeAr } from '../../../../test/fakeArabic.js';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { AuditLog } from '../../audit/audit.model.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { clearGlossaryCache } from '../glossary.js';
import { processTranslationJob } from '../i18n.jobs.js';
import { localized, LocalizedString, setTranslationScheduler } from '../localized.plugin.js';
import { setTranslationProviderOverride, translate } from '../translate.service.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const schema = new mongoose.Schema({ name: LocalizedString });
schema.plugin(localized, { fields: ['name'] });
const Thing = mongoose.models.AdminTestThing ?? mongoose.model('AdminTestThing', schema);

const PW = 'staff-pass-123';
let app;
let jobs;
const tokens = {};
const as = (who) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${tokens[who]}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${tokens[who]}`).send(b),
  put: (u, b) => request(app).put(u).set('Authorization', `Bearer ${tokens[who]}`).send(b),
  patch: (u, b) => request(app).patch(u).set('Authorization', `Bearer ${tokens[who]}`).send(b),
  delete: (u) => request(app).delete(u).set('Authorization', `Bearer ${tokens[who]}`),
});
const login = async (email) =>
  (await request(app).post('/api/v1/auth/staff/login').send({ email, password: PW })).body.data
    .accessToken;

beforeEach(async () => {
  clearGlossaryCache();
  await loadSettings();
  jobs = [];
  setTranslationScheduler(async (job) => jobs.push(job));
  setTranslationProviderOverride({
    name: 'fake',
    enabled: true,
    translateBatch: async (t) => t.map(fakeAr),
  });
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  const { Role } = await import('../../rbac/role.model.js');
  const viewer = await Role.create({
    name: 'Viewer',
    nameKey: 'viewer',
    permissions: ['settings.view'],
  });
  await createStaff(null, {
    name: 'View Only',
    email: 'view@shop.test',
    password: PW,
    roleId: String(viewer._id),
  });
  tokens.root = await login('root@shop.test');
  tokens.viewer = await login('view@shop.test');
});
afterAll(() => setTranslationProviderOverride(null));

describe('permissions', () => {
  it('viewers can read; only settings.languages can change anything', async () => {
    expect((await as('viewer').get('/api/v1/i18n/overview')).status).toBe(200);
    expect((await as('viewer').get('/api/v1/i18n/glossary')).status).toBe(200);
    expect(
      (await as('viewer').post('/api/v1/i18n/glossary', { term: 'Mada', doNotTranslate: true }))
        .status,
    ).toBe(403);
    expect((await as('viewer').post('/api/v1/i18n/retranslate', { scope: 'all' })).status).toBe(
      403,
    );
    expect((await request(app).get('/api/v1/i18n/overview')).status).toBe(401);
  });
});

describe('overview & provider test', () => {
  it('reports provider, usage, languages and content status; queue unknown when Redis is down', async () => {
    await Thing.create({ name: { en: 'Blue shirt' } });
    const res = await as('root').get('/api/v1/i18n/overview');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      provider: 'noop',
      usage: { chars: 0, budget: 0 },
      queue: null,
    });
    expect(res.body.data.content.find((c) => c.model === 'AdminTestThing')).toMatchObject({
      pending: 1,
      failed: 0,
    });
  });

  it('test round-trips a sample through the pipeline', async () => {
    const res = await as('root').post('/api/v1/i18n/provider/test');
    expect(res.body.data).toMatchObject({
      provider: 'fake',
      ok: true,
      result: fakeAr('Add to cart'),
    });
  });
});

describe('glossary', () => {
  it('CRUD with validation; changes bump the version so cached translations are not reused', async () => {
    expect((await translate({ texts: ['Buy now'], to: 'ar' })).results[0]).toBe(fakeAr('Buy now'));
    const bad = await as('root').post('/api/v1/i18n/glossary', {
      term: 'Buy now',
      doNotTranslate: false,
    });
    expect(bad.status).toBe(400); // preferred pair needs a translation

    const created = await as('root').post('/api/v1/i18n/glossary', {
      term: 'Buy now',
      doNotTranslate: false,
      targets: { ar: 'PREFERRED' },
    });
    expect(created.status).toBe(201);
    expect((await translate({ texts: ['Buy now'], to: 'ar' })).results[0]).toBe('PREFERRED'); // not the cached old one

    expect(
      (await as('root').post('/api/v1/i18n/glossary', { term: 'buy NOW', doNotTranslate: true }))
        .status,
    ).toBe(409);
    const id = created.body.data.id;
    const updated = await as('root').patch(`/api/v1/i18n/glossary/${id}`, {
      targets: { ar: 'BETTER' },
    });
    expect(updated.body.data.targets).toEqual({ ar: 'BETTER' });
    expect((await translate({ texts: ['Buy now'], to: 'ar' })).results[0]).toBe('BETTER');

    expect((await as('root').delete(`/api/v1/i18n/glossary/${id}`)).status).toBe(204);
    expect((await as('root').get('/api/v1/i18n/glossary')).body.data).toEqual([]);
    expect(
      await waitFor(() =>
        AuditLog.countDocuments({ action: 'glossary.updated' }).then((n) => n === 3),
      ),
    ).toBe(true);
  });
});

describe('UI string overrides', () => {
  const url = (key) => `/api/v1/i18n/admin/ui-overrides/storefront/ar/${key}`;

  it('set → served publicly; placeholders must be kept; revert removes it; all audited', async () => {
    const lost = await as('root').put(url('home.title'), {
      value: 'X',
      source: 'Welcome to {{store}}',
    });
    expect(lost.status).toBe(400);
    expect(lost.body.error.details[0]).toMatchObject({
      path: 'value',
      message: 'validation.placeholdersChanged',
    });

    const ok = await as('root').put(url('home.title'), {
      value: 'HUMAN {{store}}',
      source: 'Welcome to {{store}}',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.srcHash).toHaveLength(64);

    const pub = await request(app).get('/api/v1/i18n/ui-overrides/storefront/ar');
    expect(pub.body.data).toEqual({ 'home.title': 'HUMAN {{store}}' });
    expect(pub.headers['cache-control']).toMatch(/max-age=60/);

    expect((await as('root').delete(url('home.title'))).status).toBe(204);
    expect((await as('root').delete(url('home.title'))).status).toBe(404);
    expect((await request(app).get('/api/v1/i18n/ui-overrides/storefront/ar')).body.data).toEqual(
      {},
    );
    await waitFor(() => AuditLog.countDocuments({ entityType: 'uiString' }).then((n) => n === 2));
  });

  it('rejects unknown catalogs/languages and malformed keys', async () => {
    expect((await request(app).get('/api/v1/i18n/ui-overrides/storefront/en')).status).toBe(400);
    expect((await request(app).get('/api/v1/i18n/ui-overrides/other/ar')).status).toBe(400);
    expect(
      (
        await as('root').put('/api/v1/i18n/admin/ui-overrides/storefront/ar/$where', {
          value: 'x',
          source: 'x',
        })
      ).status,
    ).toBe(400);
  });
});

describe('retranslate', () => {
  it('pending_failed schedules only untranslated/failed items; all forces every auto item (never manual)', async () => {
    const a = await Thing.create({ name: { en: 'Blue shirt' } }); // pending
    const b = await Thing.create({ name: { en: 'Red shirt' } });
    for (const j of jobs.splice(0)) await processTranslationJob(j); // both done
    await Thing.updateOne({ _id: b._id }, { $set: { 'name.meta.ar.status': 'failed' } });
    const c = await Thing.create({ name: { en: 'Green shirt' } });
    const manual = await Thing.findById(c._id);
    manual.set('name.ar', 'HUMAN');
    manual.set('name.meta', { ar: { mode: 'manual', status: 'done' } });
    manual.markModified('name.meta');
    await manual.save();
    jobs.length = 0;

    const r1 = await as('root').post('/api/v1/i18n/retranslate', { scope: 'pending_failed' });
    expect(r1.status).toBe(202);
    expect(jobs.map((j) => j.id)).toEqual([String(b._id)]);

    jobs.length = 0;
    const r2 = await as('root').post('/api/v1/i18n/retranslate', { scope: 'all' });
    expect(r2.body.data.scheduled).toBe(2);
    expect(jobs.every((j) => j.force)).toBe(true);
    expect(jobs.map((j) => j.id).sort()).toEqual([String(a._id), String(b._id)].sort());

    // A forced job re-translates even though status is done; manual stays untouched.
    setTranslationProviderOverride({
      name: 'better',
      enabled: true,
      translateBatch: async (t) => t.map((x) => fakeAr(x).repeat(2)),
    });
    for (const j of jobs.splice(0)) await processTranslationJob(j);
    expect((await Thing.findById(a._id).lean()).name.ar).toBe(fakeAr('Blue shirt').repeat(2)); // new provider, not old cache
    expect((await Thing.findById(c._id).lean()).name.ar).toBe('HUMAN');
  });
});
