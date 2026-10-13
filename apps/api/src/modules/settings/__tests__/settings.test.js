import { z } from 'zod';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { waitFor } from '../../../../test/http.js';
import { createApp } from '../../../app.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import {
  getSecretSetting,
  getSetting,
  loadSettings,
  registerSettingDefinitions,
} from '../index.js';
import { Setting } from '../settings.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

// A server-only secret setting, registered the way an adapter module would.
const SECRET_KEY = 'test.providerApiKey';
registerSettingDefinitions([
  {
    key: SECRET_KEY,
    group: 'languages',
    schema: z.string().min(8).max(200),
    default: null,
    secret: true,
  },
]);

const PW = 'staff-pass-123';
const up = { db: () => true, redis: async () => true };
let app;
const tokens = {};

const as = (who) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[who]}`),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
});
const login = async (email) =>
  (await request(app).post('/api/v1/auth/staff/login').send({ email, password: PW })).body.data
    .accessToken;
const change = (key, value) => ({ changes: [{ key, value }] });

beforeEach(async () => {
  await loadSettings(); // DB was wiped after the previous test
  app = createApp({ checks: up });
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  const { Role } = await import('../../rbac/role.model.js');
  const role = await Role.create({
    name: 'Ops',
    nameKey: 'ops',
    permissions: ['settings.view', 'settings.general'],
  });
  await createStaff(null, {
    name: 'Ops Person',
    email: 'ops@shop.test',
    password: PW,
    roleId: String(role._id),
  });
  await createStaff(null, { name: 'No Access', email: 'none@shop.test', password: PW });
  tokens.root = await login('root@shop.test');
  tokens.ops = await login('ops@shop.test');
  tokens.none = await login('none@shop.test');
});

describe('reading', () => {
  it('getSetting returns defaults (deep-frozen) until overridden', () => {
    expect(getSetting('tax.vatRateBps')).toBe(1500);
    expect(getSetting('security.passwordPolicy').minLength).toBe(10);
    expect(Object.isFrozen(getSetting('store.weekendDays'))).toBe(true);
    expect(() => getSetting('no.such.key')).toThrow(/Unknown setting/);
    expect(() => getSetting(SECRET_KEY)).toThrow(/secret/);
  });

  it('GET /settings requires settings.view and marks editability per group', async () => {
    expect((await request(app).get('/api/v1/settings')).status).toBe(401);
    expect((await as('none').get('/api/v1/settings')).status).toBe(403);
    const res = await as('ops').get('/api/v1/settings');
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.data.map((s) => [s.key, s]));
    expect(byKey['tax.vatRateBps']).toMatchObject({
      value: 1500,
      isDefault: true,
      editable: true,
      group: 'tax',
    });
    expect(byKey['security.lockoutMinutes'].editable).toBe(false);
    expect(byKey[SECRET_KEY].value).toEqual({ isSet: false, masked: '' });
    expect(res.body.meta.groups).toContain('security');
  });

  it('filters by group', async () => {
    const res = await as('ops').get('/api/v1/settings?group=tax');
    expect(res.body.data.map((s) => s.key).sort()).toEqual([
      'tax.pricesIncludeVat',
      'tax.vatNumber',
      'tax.vatRateBps',
    ]);
    expect((await as('ops').get('/api/v1/settings?group=nope')).status).toBe(400);
  });

  it('GET /settings/public needs no auth and exposes only public, non-secret keys', async () => {
    const res = await request(app).get('/api/v1/settings/public');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=60/);
    expect(res.body.data).toMatchObject({ 'store.currency': 'SAR', 'tax.vatRateBps': 1500 });
    expect(res.body.data).not.toHaveProperty('tax.vatNumber');
    expect(res.body.data).not.toHaveProperty('security.lockoutMaxAttempts');
    expect(res.body.data).not.toHaveProperty(SECRET_KEY);
  });
});

describe('writing', () => {
  it('validates each key with its own schema (i18n keys, path = setting key)', async () => {
    const res = await as('root').patch('/api/v1/settings', {
      changes: [
        { key: 'tax.vatRateBps', value: 15.5 },
        { key: 'tax.vatNumber', value: '123' },
        { key: 'store.name', value: '<b>x</b>' },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual([
      'store.name',
      'tax.vatNumber',
      'tax.vatRateBps',
    ]);
    expect(res.body.error.details.every((d) => d.message.startsWith('validation.'))).toBe(true);
  });

  it('is atomic: one invalid or forbidden key → nothing changes', async () => {
    await as('root').patch('/api/v1/settings', {
      changes: [
        { key: 'tax.vatRateBps', value: 1000 },
        { key: 'security.lockoutMinutes', value: 0 },
      ],
    });
    expect(getSetting('tax.vatRateBps')).toBe(1500);
    const forbidden = await as('ops').patch('/api/v1/settings', {
      changes: [
        { key: 'tax.vatRateBps', value: 1000 },
        { key: 'security.lockoutMinutes', value: 30 },
      ],
    });
    expect(forbidden.status).toBe(403);
    expect(getSetting('tax.vatRateBps')).toBe(1500);
  });

  it('rejects unknown and duplicate keys', async () => {
    expect(
      (await as('root').patch('/api/v1/settings', change('made.up', 1))).body.error.details[0],
    ).toMatchObject({
      path: 'made.up',
      code: 'unknown_key',
    });
    const dup = await as('root').patch('/api/v1/settings', {
      changes: [
        { key: 'tax.vatRateBps', value: 1 },
        { key: 'tax.vatRateBps', value: 2 },
      ],
    });
    expect(dup.status).toBe(400);
  });

  it('applies, persists, transforms, and resets', async () => {
    const res = await as('ops').patch('/api/v1/settings', {
      changes: [
        { key: 'store.weekendDays', value: [6, 5, 5] },
        { key: 'tax.vatNumber', value: '300000000000003' },
      ],
    });
    expect(res.status).toBe(200);
    expect(getSetting('store.weekendDays')).toEqual([5, 6]);
    await loadSettings(); // simulate another process / restart
    expect(getSetting('tax.vatNumber')).toBe('300000000000003');

    await as('ops')
      .post('/api/v1/settings/reset', { keys: ['tax.vatNumber'] })
      .expect(200);
    expect(getSetting('tax.vatNumber')).toBeNull();
    expect(await Setting.countDocuments({ key: 'tax.vatNumber' })).toBe(0);
  });

  it('a stored value that no longer matches its schema falls back to the default', async () => {
    await Setting.create({ key: 'tax.vatRateBps', value: 'fifteen' });
    await Setting.create({ key: 'removed.setting', value: 1 });
    await loadSettings();
    expect(getSetting('tax.vatRateBps')).toBe(1500);
  });
});

describe('secrets', () => {
  it('are encrypted at rest, masked in responses, readable server-side, clearable', async () => {
    const secret = 'sk_live_abcdef123456';
    const res = await as('root').patch('/api/v1/settings', change(SECRET_KEY, secret));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(res.body.data[0].value).toEqual({ isSet: true, masked: '••••3456' });

    const doc = await Setting.findOne({ key: SECRET_KEY }).lean();
    expect(doc.value).toBeNull();
    expect(doc.encryptedValue).toMatch(/^v1\./);
    expect(JSON.stringify(doc)).not.toContain(secret);

    await loadSettings();
    expect(getSecretSetting(SECRET_KEY)).toBe(secret);
    const list = await as('root').get('/api/v1/settings?group=languages');
    expect(JSON.stringify(list.body)).not.toContain(secret);

    await as('root').patch('/api/v1/settings', change(SECRET_KEY, null)).expect(200);
    expect(getSecretSetting(SECRET_KEY)).toBeNull();
  });

  it('a ciphertext copied to another key cannot be decrypted (AAD-bound)', async () => {
    await as('root').patch('/api/v1/settings', change(SECRET_KEY, 'sk_live_abcdef123456'));
    const doc = await Setting.findOne({ key: SECRET_KEY }).lean();
    registerSettingDefinitions([
      {
        key: 'test.otherSecret',
        group: 'languages',
        schema: z.string(),
        default: null,
        secret: true,
      },
    ]);
    await Setting.create({ key: 'test.otherSecret', encryptedValue: doc.encryptedValue });
    await loadSettings();
    expect(getSecretSetting('test.otherSecret')).toBeNull();
  });
});

describe('settings drive behavior live', () => {
  it('lockout threshold', async () => {
    await as('root')
      .patch('/api/v1/settings', change('security.lockoutMaxAttempts', 3))
      .expect(200);
    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'none@shop.test', password: `wrong-${i}-pass` });
    }
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'none@shop.test', password: PW });
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('password policy applies to the next request', async () => {
    const register = (password) =>
      request(app)
        .post('/api/v1/customers/register')
        .send({ name: 'Cust Omer', email: `c${password.length}@x.com`, password });
    await as('root')
      .patch(
        '/api/v1/settings',
        change('security.passwordPolicy', {
          minLength: 14,
          requireLower: true,
          requireUpper: true,
          requireDigit: true,
          requireSymbol: false,
        }),
      )
      .expect(200);
    const weak = await register('lowercase-pass-1');
    expect(weak.body.error.details.map((d) => d.message)).toContain(
      'validation.password.needsUpper',
    );
    expect((await register('Uppercase-pass-1')).status).toBe(201);
  });

  it('international phones toggle', async () => {
    const body = {
      name: 'Cust Omer',
      email: 'intl@x.com',
      phone: '+44 20 7946 0958',
      password: 'some-pass-123',
    };
    expect((await request(app).post('/api/v1/customers/register').send(body)).status).toBe(400);
    await as('root')
      .patch('/api/v1/settings', change('customers.allowInternationalPhone', true))
      .expect(200);
    expect((await request(app).post('/api/v1/customers/register').send(body)).status).toBe(201);
  });
});

describe('audit of settings changes', () => {
  it('records one entry per key with before/after (secrets masked)', async () => {
    const { AuditLog } = await import('../../audit/audit.model.js');
    await as('root').patch('/api/v1/settings', {
      changes: [
        { key: 'tax.vatRateBps', value: 1000 },
        { key: SECRET_KEY, value: 'sk_live_abcdef123456' },
      ],
    });
    const entries = await waitFor(async () => {
      const list = await AuditLog.find({ action: 'settings.updated' }).lean();
      return list.length === 2 && list;
    });
    const byKey = Object.fromEntries(entries.map((e) => [e.entityId, e]));
    expect(byKey['tax.vatRateBps']).toMatchObject({
      before: 1500,
      after: 1000,
      actorType: 'staff',
      entityType: 'setting',
    });
    expect(byKey[SECRET_KEY]).toMatchObject({ before: null, after: '••••3456' });
    expect(JSON.stringify(entries)).not.toContain('sk_live_abcdef123456');
  });
});
