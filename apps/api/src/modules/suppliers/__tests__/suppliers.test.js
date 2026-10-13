import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { setSupplierUsageCounter } from '../index.js';

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

beforeEach(async () => {
  setSupplierUsageCounter(async () => 0);
  await loadSettings();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  for (const [who, key] of [
    ['catalog', 'catalog_editor'],
    ['clerk', 'inventory_clerk'],
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
  for (const who of ['root', 'catalog', 'clerk', 'cashier']) {
    const res = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: `${who}@shop.test`, password: PW });
    tokens[who] = res.body.data.accessToken;
  }
});

describe('suppliers', () => {
  it('creates with normalized contact data; strict field validation', async () => {
    const res = await as('catalog').post('/api/v1/suppliers', {
      name: '3M Arabia',
      contactName: 'Sara Al-Harbi',
      phone: '055 123 4567',
      email: 'Sales@3M.Example',
      taxNumber: '310 123 456 700 003',
      paymentTermsDays: 30,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: '3M Arabia',
      phone: '+966551234567',
      email: 'sales@3m.example',
      taxNumber: '310123456700003',
      paymentTermsDays: 30,
      isActive: true,
    });
    const intl = await as('catalog').post('/api/v1/suppliers', {
      name: 'Shenzhen Parts',
      phone: '+86 138 0013 8000',
    });
    expect(intl.body.data.phone).toBe('+8613800138000');

    for (const bad of [
      { name: 'X' },
      { name: 'Ok Co', contactName: 'R2D2' },
      { name: 'Ok Co', phone: 'call me' },
      { name: 'Ok Co', paymentTermsDays: 1.5 },
      { name: 'Ok Co', notes: '<script>x</script>' },
    ]) {
      expect((await as('catalog').post('/api/v1/suppliers', bad)).status).toBe(400);
    }
    const dup = await as('catalog').post('/api/v1/suppliers', { name: '3m arabia' });
    expect(dup.body.error.code).toBe('NAME_TAKEN');
  });

  it('updates (empty string clears), searches, audits without contact details', async () => {
    const s = (
      await as('catalog').post('/api/v1/suppliers', {
        name: 'Al Noor Trading',
        email: 'buy@noor.example',
        phone: '0501112222',
      })
    ).body.data;
    await as('catalog').post('/api/v1/suppliers', { name: 'Gulf Foods' });
    const upd = await as('catalog').patch(`/api/v1/suppliers/${s.id}`, {
      email: '',
      paymentTermsDays: 45,
    });
    expect(upd.body.data).toMatchObject({
      email: null,
      phone: '+966501112222',
      paymentTermsDays: 45,
    });
    expect((await as('catalog').get('/api/v1/suppliers?q=0501112')).body.data).toHaveLength(0);
    expect((await as('catalog').get('/api/v1/suppliers?q=50111')).body.data[0].name).toBe(
      'Al Noor Trading',
    );
    expect((await as('catalog').get('/api/v1/suppliers')).body.data.map((x) => x.name)).toEqual([
      'Al Noor Trading',
      'Gulf Foods',
    ]);

    let entries;
    await waitFor(async () => {
      entries = (await as('root').get('/api/v1/audit?action=supplier.updated')).body.data;
      return entries.length === 1;
    });
    expect(JSON.stringify(entries[0])).not.toContain('noor.example');
    expect(JSON.stringify(entries[0])).not.toContain('501112222');
  });

  it('permissions: purchase viewers read, only supplier.manage writes; delete guard', async () => {
    const s = (await as('catalog').post('/api/v1/suppliers', { name: 'Acme Supply' })).body.data;
    expect((await request(app).get('/api/v1/suppliers')).status).toBe(401);
    expect((await as('cashier').get('/api/v1/suppliers')).status).toBe(403);
    expect((await as('clerk').get('/api/v1/suppliers')).status).toBe(200); // purchase.view
    expect((await as('clerk').patch(`/api/v1/suppliers/${s.id}`, { notes: 'x' })).status).toBe(403);

    setSupplierUsageCounter(async () => 1);
    expect((await as('catalog').delete(`/api/v1/suppliers/${s.id}`)).body.error.code).toBe(
      'SUPPLIER_IN_USE',
    );
    setSupplierUsageCounter(async () => 0);
    expect((await as('catalog').delete(`/api/v1/suppliers/${s.id}`)).status).toBe(204);
    expect((await as('catalog').get(`/api/v1/suppliers/${s.id}`)).status).toBe(404);
  });
});
