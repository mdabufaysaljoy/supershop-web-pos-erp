import { PERMISSIONS as P } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { registerBranchUsage, seedMainBranch } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
let usage = 0;
const tokens = {};
const ids = {};
const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const login = async (who) => {
  const res = await request(app)
    .post('/api/v1/auth/staff/login')
    .send({ email: `${who}@shop.test`, password: PW });
  tokens[who] = res.body.data.accessToken;
};
const createBranch = async (body) => {
  const res = await as('root').post('/api/v1/branches', body);
  if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const role = async (name, permissions, allBranches) => {
  const res = await as('root').post('/api/v1/roles', { name, permissions, allBranches });
  if (res.status !== 201) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id;
};

registerBranchUsage(async () => usage);

beforeEach(async () => {
  usage = 0;
  setTranslationScheduler(async () => {});
  await loadSettings();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  await login('root');

  ids.riyadh = (await createBranch({ code: 'ryd-1', name: 'Riyadh Olaya' })).id;
  ids.jeddah = (await createBranch({ code: 'JED-1', name: 'Jeddah Corniche' })).id;

  const managerRole = await role(
    'Branch Manager',
    [P.BRANCH_VIEW, P.BRANCH_MANAGE, P.STAFF_VIEW, P.STAFF_MANAGE, P.POS_SELL],
    false,
  );
  const viewerRole = await role('Branch Viewer', [P.BRANCH_VIEW], true);
  const cashierRole = await role('Till', [P.POS_SELL], false);
  const staff = [
    ['manager', managerRole, [ids.riyadh]],
    ['viewer', viewerRole, []],
    ['cashier', cashierRole, [ids.riyadh]],
    ['jcashier', cashierRole, [ids.jeddah]],
  ];
  for (const [who, roleId, branchIds] of staff) {
    const s = await createStaff(null, {
      name: 'Staff Member',
      email: `${who}@shop.test`,
      password: PW,
      roleId,
      branchIds,
    });
    ids[who] = s.id;
    await login(who);
  }
});

describe('branches', () => {
  it('creates with normalized code, address and flags; codes are unique', async () => {
    const b = await createBranch({
      code: 'dmm-1',
      name: 'Dammam Warehouse',
      type: 'warehouse',
      phone: '0512345678',
      address: { city: 'Dammam', postalCode: '32241', shortAddress: 'dmma1234' },
      location: { lat: 26.43, lng: 50.1 },
      pickupEnabled: true,
    });
    expect(b).toMatchObject({
      code: 'DMM-1',
      name: { en: 'Dammam Warehouse' },
      type: 'warehouse',
      phone: '+966512345678',
      isActive: true,
      fulfillsOnlineOrders: false,
      pickupEnabled: true,
      staffCount: 0,
      location: { lat: 26.43, lng: 50.1 },
    });
    expect(b.address).toMatchObject({
      city: 'Dammam',
      postalCode: '32241',
      shortAddress: 'DMMA1234',
      street: null,
    });

    const dup = await as('root').post('/api/v1/branches', { code: 'DMM-1', name: 'Other' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0]).toMatchObject({ path: 'code' });

    const bad = await as('root').post('/api/v1/branches', {
      code: 'x',
      name: '',
      address: { postalCode: '12', evil: 1 },
    });
    expect(bad.status).toBe(400);
    const paths = bad.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['code', 'name', 'address.postalCode']));

    const audit = await waitFor(async () => {
      const res = await as('root').get('/api/v1/audit?action=branch.created');
      return res.body.data.length >= 3 ? res : null;
    });
    expect(audit.body.data[0].after).toMatchObject({ code: 'DMM-1' });
  });

  it('lists with staff counts; branch-scoped staff only see their branches', async () => {
    const all = await as('root').get('/api/v1/branches');
    expect(all.status).toBe(200);
    const byCode = Object.fromEntries(all.body.data.map((b) => [b.code, b]));
    expect(byCode['RYD-1'].staffCount).toBe(2);
    expect(byCode['JED-1'].staffCount).toBe(1);

    const mine = await as('manager').get('/api/v1/branches');
    expect(mine.body.data.map((b) => b.code)).toEqual(['RYD-1']);
    expect((await as('manager').get(`/api/v1/branches/${ids.jeddah}`)).status).toBe(404);
    expect((await as('viewer').get('/api/v1/branches')).body.data).toHaveLength(2);
    expect((await as('cashier').get('/api/v1/branches')).status).toBe(403);
    expect((await request(app).get('/api/v1/branches')).status).toBe(401);
  });

  it('only HQ creates/deletes; scoped managers edit their own branch', async () => {
    const created = await as('manager').post('/api/v1/branches', { code: 'NEW-1', name: 'New' });
    expect(created.status).toBe(403);
    expect(created.body.error.code).toBe('BRANCH_SCOPE_DENIED');
    expect((await as('viewer').post('/api/v1/branches', { code: 'NEW-1', name: 'N' })).status).toBe(
      403,
    );

    const own = await as('manager').patch(`/api/v1/branches/${ids.riyadh}`, {
      name: 'Riyadh Olaya Mall',
      address: { city: 'Riyadh' },
    });
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ name: { en: 'Riyadh Olaya Mall' }, code: 'RYD-1' });
    expect(own.body.data.address.city).toBe('Riyadh');
    const cleared = await as('manager').patch(`/api/v1/branches/${ids.riyadh}`, {
      address: { city: null, street: 'King Fahd Rd' },
    });
    expect(cleared.body.data.address).toMatchObject({ city: null, street: 'King Fahd Rd' });

    expect(
      (await as('manager').patch(`/api/v1/branches/${ids.jeddah}`, { name: 'X' })).status,
    ).toBe(404);
    expect((await as('manager').delete(`/api/v1/branches/${ids.riyadh}`)).status).toBe(403);
    const taken = await as('root').patch(`/api/v1/branches/${ids.jeddah}`, { code: 'RYD-1' });
    expect(taken.status).toBe(409);
    expect((await as('root').patch(`/api/v1/branches/${ids.jeddah}`, {})).status).toBe(400);
  });

  it('refuses to delete a branch in use; deleted branches cannot be assigned', async () => {
    const res = await as('root').delete(`/api/v1/branches/${ids.jeddah}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BRANCH_IN_USE');

    const empty = await createBranch({ code: 'TMP-1', name: 'Temp' });
    usage = 3; // e.g. stock or orders registered by a later module
    expect((await as('root').delete(`/api/v1/branches/${empty.id}`)).status).toBe(409);
    usage = 0;
    expect((await as('root').delete(`/api/v1/branches/${empty.id}`)).status).toBe(204);
    expect((await as('root').get(`/api/v1/branches/${empty.id}`)).status).toBe(404);

    // The code is free again after deletion.
    await createBranch({ code: 'TMP-1', name: 'Temp again' });

    const assign = await as('root').patch(`/api/v1/staff/${ids.cashier}`, {
      branchIds: [ids.riyadh, empty.id],
    });
    expect(assign.status).toBe(400);
    expect(assign.body.error.details).toEqual([expect.objectContaining({ path: 'branchIds.1' })]);
  });

  it('assigns and unassigns staff through the staff guards', async () => {
    const list = await as('manager').get(`/api/v1/branches/${ids.riyadh}/staff`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((s) => s.email).sort()).toEqual([
      'cashier@shop.test',
      'manager@shop.test',
    ]);

    // HQ moves the Jeddah cashier into Riyadh as well.
    const add = await as('root').post(`/api/v1/branches/${ids.riyadh}/staff`, {
      staffId: ids.jcashier,
    });
    expect(add.status).toBe(200);
    expect(add.body.data.branchIds.sort()).toEqual([ids.riyadh, ids.jeddah].sort());
    // Idempotent.
    expect(
      (await as('root').post(`/api/v1/branches/${ids.riyadh}/staff`, { staffId: ids.jcashier }))
        .status,
    ).toBe(200);

    // Scoped manager: may not touch staff of other branches or their own access.
    const self = await as('manager').delete(`/api/v1/branches/${ids.riyadh}/staff/${ids.manager}`);
    expect(self.status).toBe(403);
    const other = await as('manager').post(`/api/v1/branches/${ids.jeddah}/staff`, {
      staffId: ids.cashier,
    });
    expect(other.status).toBe(404);

    const off = await as('manager').delete(`/api/v1/branches/${ids.riyadh}/staff/${ids.cashier}`);
    expect(off.status).toBe(200);
    expect(off.body.data.branchIds).toEqual([]);
    expect(
      (await as('viewer').post(`/api/v1/branches/${ids.riyadh}/staff`, { staffId: ids.cashier }))
        .status,
    ).toBe(403);
    expect((await as('viewer').get(`/api/v1/branches/${ids.riyadh}/staff`)).status).toBe(403);
  });

  it('public list shows active stores with names per language', async () => {
    await as('root').patch(`/api/v1/branches/${ids.jeddah}`, { isActive: false });
    const res = await request(app).get('/api/v1/branches/public?lang=ar');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ code: 'RYD-1', name: 'Riyadh Olaya' }),
    ]);
    expect(res.body.data[0]).not.toHaveProperty('staffCount');
  });

  it('seeds a main branch only when none exists', async () => {
    expect(await seedMainBranch()).toBeNull();
    await as('root').delete(`/api/v1/staff/${ids.jcashier}`);
    for (const id of [ids.riyadh, ids.jeddah]) {
      for (const who of ['manager', 'cashier']) {
        await as('root').delete(`/api/v1/branches/${id}/staff/${ids[who]}`);
      }
      expect((await as('root').delete(`/api/v1/branches/${id}`)).status).toBe(204);
    }
    const main = await seedMainBranch();
    expect(main).toMatchObject({ code: 'MAIN', fulfillsOnlineOrders: true });
    expect(await seedMainBranch()).toBeNull();
  });
});
