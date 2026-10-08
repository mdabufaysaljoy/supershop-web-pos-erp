import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextEvent } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { DEFAULT_ROLES, findSystemRoleId, seedDefaultRoles } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const B1 = '64b000000000000000000001';
const B2 = '64b000000000000000000002';
const PW = 'staff-pass-123';
const up = { db: () => true, redis: async () => true };

let app;
const tokens = {};
const ids = {};

async function loginAs(email) {
  const res = await request(app).post('/api/v1/auth/staff/login').send({ email, password: PW });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.body.data.accessToken;
}

const as = (who) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[who]}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${tokens[who]}`),
});

beforeEach(async () => {
  app = createApp({ checks: up });
  await seedDefaultRoles();
  const managerRole = await findSystemRoleId('store_manager');
  const cashierRole = await findSystemRoleId('cashier');

  // A role that can manage staff, but only holds a subset of permissions (escalation tests).
  const { Role } = await import('../role.model.js');
  const hrRole = await Role.create({
    name: 'Branch HR',
    nameKey: 'branch hr',
    permissions: [
      'staff.view',
      'staff.manage',
      'role.manage',
      'pos.sell',
      'shift.open',
      'shift.close',
      'shift.view',
      'return.create',
      'product.view',
      'inventory.view',
      'customer.view',
      'loyalty.view',
      'order.view',
    ],
  });

  const root = await ensureSuperAdmin({
    name: 'Root Admin',
    email: 'root@shop.test',
    password: PW,
  });
  ids.root = root.staff.id;
  ids.manager = (
    await createStaff(null, {
      name: 'Maha Manager',
      email: 'manager@shop.test',
      password: PW,
      roleId: managerRole,
      branchIds: [B1],
    })
  ).id;
  ids.cashier1 = (
    await createStaff(null, {
      name: 'Cara Cashier',
      email: 'cashier1@shop.test',
      password: PW,
      roleId: cashierRole,
      branchIds: [B1],
    })
  ).id;
  ids.cashier2 = (
    await createStaff(null, {
      name: 'Omar Cashier',
      email: 'cashier2@shop.test',
      password: PW,
      roleId: cashierRole,
      branchIds: [B2],
    })
  ).id;
  ids.hr = (
    await createStaff(null, {
      name: 'Huda HR',
      email: 'hr@shop.test',
      password: PW,
      roleId: String(hrRole._id),
      branchIds: [B1],
    })
  ).id;
  ids.roles = { manager: managerRole, cashier: cashierRole, hr: String(hrRole._id) };

  for (const who of ['root', 'manager', 'cashier1', 'hr'])
    tokens[who] = await loginAs(`${who === 'cashier1' ? 'cashier1' : who}@shop.test`);
});

describe('authorization matrix', () => {
  it('401 without a token, 401 with a customer token, 403 without permission', async () => {
    expect((await request(app).get('/api/v1/staff')).status).toBe(401);
    const cust = await request(app)
      .post('/api/v1/customers/register')
      .send({ name: 'Cust Omer', email: 'c@x.com', password: 'cust-pass-123' });
    const custRes = await request(app)
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${cust.body.data.accessToken}`);
    expect(custRes.status).toBe(401);
    const denied = await as('cashier1').get('/api/v1/staff');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect((await as('cashier1').get('/api/v1/roles')).status).toBe(403);
  });

  it.each([
    ['get', '/api/v1/roles', 'manager', 403],
    ['get', '/api/v1/roles', 'hr', 200],
    ['get', '/api/v1/roles/permissions', 'hr', 200],
    ['get', '/api/v1/staff', 'manager', 200],
    ['post', '/api/v1/staff', 'manager', 403],
    ['post', '/api/v1/roles', 'manager', 403],
    ['get', '/api/v1/staff/me/access', 'cashier1', 200],
  ])('%s %s as %s → %i', async (method, url, who, status) => {
    expect((await as(who)[method](url, {})).status).toBe(status);
  });

  it('super-admin can do anything; mutations emit an audit event', async () => {
    const audited = nextEvent(EVENTS.ACCESS_SUPER_ADMIN_USED);
    const res = await as('root').post('/api/v1/roles', {
      name: 'Auditor',
      permissions: ['audit.view'],
    });
    expect(res.status).toBe(201);
    expect((await audited).payload).toMatchObject({ staffId: ids.root, method: 'POST' });
  });

  it('/staff/me/access returns the effective permissions and branches', async () => {
    const res = await as('cashier1').get('/api/v1/staff/me/access');
    expect(res.body.data).toMatchObject({
      isSuperAdmin: false,
      allBranches: false,
      branchIds: [B1],
    });
    expect(res.body.data.permissions).toContain('pos.sell');
    expect(res.body.data.permissions).not.toContain('order.refund');
  });

  it('permission changes apply on the very next request (no stale cache)', async () => {
    expect((await as('manager').get('/api/v1/roles')).status).toBe(403);
    await as('root').patch(`/api/v1/roles/${ids.roles.manager}`, {
      permissions: [
        ...DEFAULT_ROLES.find((r) => r.systemKey === 'store_manager').permissions,
        'role.manage',
      ],
    });
    expect((await as('manager').get('/api/v1/roles')).status).toBe(200);
  });

  it('a disabled staff member is locked out immediately', async () => {
    await as('root').patch(`/api/v1/staff/${ids.cashier1}`, { status: 'disabled' }).expect(200);
    expect((await as('cashier1').get('/api/v1/staff/me/access')).status).toBe(401);
  });
});

describe('roles', () => {
  it('CRUD with validation and case-insensitive unique names', async () => {
    const created = await as('root').post('/api/v1/roles', {
      name: 'Night Shift',
      permissions: ['pos.sell', 'pos.sell'],
      unknownField: 'stripped',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'Night Shift',
      permissions: ['pos.sell'],
      isSystem: false,
    });
    const id = created.body.data.id;

    expect(
      (await as('root').post('/api/v1/roles', { name: 'night shift', permissions: [] })).status,
    ).toBe(409);
    const bad = await as('root').post('/api/v1/roles', {
      name: 'X1',
      permissions: ['root.everything'],
    });
    expect(bad.status).toBe(400);

    expect(
      (await as('root').patch(`/api/v1/roles/${id}`, { description: 'Evenings' })).body.data
        .description,
    ).toBe('Evenings');
    expect((await as('root').delete(`/api/v1/roles/${id}`)).status).toBe(204);
    expect((await as('root').get(`/api/v1/roles/${id}`)).status).toBe(404);
  });

  it('protects system roles and roles in use', async () => {
    const sys = await as('root').delete(`/api/v1/roles/${ids.roles.cashier}`);
    expect(sys.body.error.code).toBe('SYSTEM_ROLE_PROTECTED');
    const inUse = await as('root').delete(`/api/v1/roles/${ids.roles.hr}`);
    expect(inUse.body.error).toMatchObject({ code: 'ROLE_IN_USE', details: { staffCount: 1 } });
  });

  it('blocks privilege escalation through roles', async () => {
    // HR holds role.manage but not order.refund → cannot create a role granting it…
    const grant = await as('hr').post('/api/v1/roles', {
      name: 'Refunder',
      permissions: ['order.refund'],
    });
    expect(grant.body.error.code).toBe('PERMISSION_ESCALATION');
    // …nor an all-branches role, nor edit a role holding more than they do, nor their own role.
    expect(
      (
        await as('hr').post('/api/v1/roles', {
          name: 'Everywhere',
          permissions: ['pos.sell'],
          allBranches: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (await as('hr').patch(`/api/v1/roles/${ids.roles.manager}`, { description: 'x' })).body.error
        .code,
    ).toBe('PERMISSION_ESCALATION');
    expect(
      (await as('hr').patch(`/api/v1/roles/${ids.roles.hr}`, { permissions: ['staff.view'] })).body
        .error.code,
    ).toBe('CANNOT_MODIFY_SELF');
    // Allowed: a subset of what they hold.
    expect(
      (await as('hr').post('/api/v1/roles', { name: 'Trainee', permissions: ['pos.sell'] })).status,
    ).toBe(201);
  });
});

describe('staff management', () => {
  it('creates staff with validation and unique email', async () => {
    const body = {
      name: 'New Person',
      email: 'New@Shop.test',
      password: 'new-pass-123',
      roleId: ids.roles.cashier,
      branchIds: [B1],
    };
    const res = await as('root').post('/api/v1/staff', body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'new@shop.test',
      roleId: ids.roles.cashier,
      branchIds: [B1],
    });
    expect((await as('root').post('/api/v1/staff', body)).status).toBe(409);
    expect(
      (await as('root').post('/api/v1/staff', { ...body, email: 'x@shop.test', roleId: 'nope' }))
        .status,
    ).toBe(400);
    // The new account can log in.
    expect(
      (
        await request(app)
          .post('/api/v1/auth/staff/login')
          .send({ email: 'new@shop.test', password: 'new-pass-123' })
      ).status,
    ).toBe(200);
  });

  it('blocks escalation and out-of-scope assignment', async () => {
    const base = { name: 'Some Body', email: 'sb@shop.test', password: 'some-pass-123' };
    expect(
      (
        await as('hr').post('/api/v1/staff', {
          ...base,
          roleId: ids.roles.manager,
          branchIds: [B1],
        })
      ).body.error.code,
    ).toBe('PERMISSION_ESCALATION');
    expect(
      (await as('hr').post('/api/v1/staff', { ...base, isSuperAdmin: true })).body.error.code,
    ).toBe('PERMISSION_ESCALATION');
    expect(
      (
        await as('hr').post('/api/v1/staff', {
          ...base,
          roleId: ids.roles.cashier,
          branchIds: [B2],
        })
      ).body.error.code,
    ).toBe('BRANCH_SCOPE_DENIED');
    expect(
      (
        await as('hr').post('/api/v1/staff', {
          ...base,
          roleId: ids.roles.cashier,
          branchIds: [B1],
        })
      ).status,
    ).toBe(201);
  });

  it('branch-scoped actors only see and manage staff in their branches; super-admins hidden', async () => {
    const list = await as('hr').get('/api/v1/staff?limit=50');
    const emails = list.body.data.map((s) => s.email).sort();
    expect(emails).toEqual(['cashier1@shop.test', 'hr@shop.test', 'manager@shop.test']);
    expect(list.body.meta).toMatchObject({ page: 1, limit: 50, total: 3 });

    expect((await as('hr').get(`/api/v1/staff/${ids.cashier2}`)).body.error.code).toBe(
      'BRANCH_SCOPE_DENIED',
    );
    expect(
      (await as('hr').patch(`/api/v1/staff/${ids.cashier2}`, { name: 'Hacked Name' })).status,
    ).toBe(403);
    expect(
      (await as('hr').patch(`/api/v1/staff/${ids.root}`, { name: 'Hacked Name' })).body.error.code,
    ).toBe('PERMISSION_ESCALATION');
  });

  it('lists with search, filters, sort and pagination', async () => {
    const res = await as('root').get(
      `/api/v1/staff?q=cashier&roleId=${ids.roles.cashier}&sort=-email&limit=1&page=2`,
    );
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.map((s) => s.email)).toEqual(['cashier1@shop.test']);
    expect((await as('root').get('/api/v1/staff?sort=passwordHash')).status).toBe(400);
    expect((await as('root').get('/api/v1/staff?q=.*')).body.meta.total).toBe(0); // regex-escaped
  });

  it('nobody changes their own access', async () => {
    for (const patch of [
      { roleId: ids.roles.manager },
      { status: 'disabled' },
      { branchIds: [B2] },
      { isSuperAdmin: true },
    ]) {
      const res = await as('hr').patch(`/api/v1/staff/${ids.hr}`, patch);
      expect(res.body.error.code).toBe('CANNOT_MODIFY_SELF');
    }
    expect((await as('hr').patch(`/api/v1/staff/${ids.hr}`, { name: 'Huda Renamed' })).status).toBe(
      200,
    );
    expect((await as('root').delete(`/api/v1/staff/${ids.root}`)).body.error.code).toBe(
      'CANNOT_MODIFY_SELF',
    );
  });

  it('keeps at least one active super-admin', async () => {
    const second = await as('root').post('/api/v1/staff', {
      name: 'Second Root',
      email: 'root2@shop.test',
      password: PW,
      isSuperAdmin: true,
    });
    tokens.root2 = await loginAs('root2@shop.test');
    expect(
      (await as('root2').patch(`/api/v1/staff/${ids.root}`, { isSuperAdmin: false })).status,
    ).toBe(200);
    const last = await as('root').patch(`/api/v1/staff/${second.body.data.id}`, {
      status: 'disabled',
    });
    // root is no longer a super-admin, so this is now an escalation attempt…
    expect(last.status).toBe(403);
    // …and the remaining super-admin cannot be removed by anyone.
    expect(
      (await as('root2').patch(`/api/v1/staff/${second.body.data.id}`, { isSuperAdmin: false }))
        .body.error.code,
    ).toBe('CANNOT_MODIFY_SELF');
  });

  it('two super-admins disabling each other at once cannot leave zero (write-skew guard)', async () => {
    const other = await as('root').post('/api/v1/staff', {
      name: 'Other Root',
      email: 'root3@shop.test',
      password: PW,
      isSuperAdmin: true,
    });
    tokens.root3 = await loginAs('root3@shop.test');
    const [a, b] = await Promise.all([
      as('root').patch(`/api/v1/staff/${other.body.data.id}`, { status: 'disabled' }),
      as('root3').patch(`/api/v1/staff/${ids.root}`, { status: 'disabled' }),
    ]);
    const statuses = [a.status, b.status].sort();
    // Exactly one wins. The loser is rejected either by the guard (409 LAST_SUPER_ADMIN) or, if the
    // winner committed first, because the loser's own account is now disabled (401/403).
    expect(statuses.filter((st) => st === 200)).toHaveLength(1);
    const { Staff } = await import('../../staff/staff.model.js');
    expect(
      await Staff.countDocuments({ isSuperAdmin: true, status: 'active', deletedAt: null }),
    ).toBe(1);
  });

  it('delete is soft: anonymizes email (re-usable), revokes sessions', async () => {
    expect((await as('root').delete(`/api/v1/staff/${ids.cashier1}`)).status).toBe(204);
    expect((await as('cashier1').get('/api/v1/staff/me/access')).status).toBe(401);
    expect((await as('root').get(`/api/v1/staff/${ids.cashier1}`)).status).toBe(404);
    const { Staff } = await import('../../staff/staff.model.js');
    const doc = await Staff.findById(ids.cashier1).lean();
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.email).toMatch(/^deleted\+.*@invalid\.local$/);
    const again = await as('root').post('/api/v1/staff', {
      name: 'Cara Again',
      email: 'cashier1@shop.test',
      password: PW,
    });
    expect(again.status).toBe(201);
  });

  it('force-revokes sessions', async () => {
    const res = await as('root').post(`/api/v1/staff/${ids.manager}/sessions/revoke`);
    expect(res.body.data.revoked).toBe(1);
    expect((await as('manager').get('/api/v1/staff')).status).toBe(401);
  });
});

describe('seeding', () => {
  it('is idempotent and never overwrites admin edits', async () => {
    const { Role } = await import('../role.model.js');
    await Role.updateOne({ systemKey: 'cashier' }, { $set: { permissions: ['pos.sell'] } });
    await seedDefaultRoles();
    expect(await Role.countDocuments({ isSystem: true })).toBe(DEFAULT_ROLES.length);
    expect((await Role.findOne({ systemKey: 'cashier' }).lean()).permissions).toEqual(['pos.sell']);
    expect(
      (await ensureSuperAdmin({ name: 'Another Root', email: 'x@shop.test', password: PW }))
        .created,
    ).toBe(false);
  });
});
