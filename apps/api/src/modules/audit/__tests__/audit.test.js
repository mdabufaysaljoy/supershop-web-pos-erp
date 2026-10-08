import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextEvent, waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { AuditLog } from '../audit.model.js';
import { scrubSecrets } from '../audit.mapping.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
let root;
let rootToken;

beforeEach(async () => {
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  root = (await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW }))
    .staff;
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW })
  ).body.data.accessToken;
});

const auditOf = (action, extra = {}) =>
  waitFor(() => AuditLog.findOne({ action, ...extra }).lean());

describe('audit trail', () => {
  it('records logins (success and failure, with IP) without credentials', async () => {
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: 'wrong-pass-1' });
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'ghost@shop.test', password: 'wrong-pass-1' });
    const ok = await auditOf('auth.loginSucceeded');
    expect(ok).toMatchObject({ actorType: 'staff', entityType: 'staff', entityId: root.id });
    expect(ok.data.ip).toBeTruthy();
    const failed = await waitFor(async () => {
      const list = await AuditLog.find({ action: 'auth.loginFailed' }).lean();
      return list.length === 2 && list;
    });
    expect(failed.map((f) => f.data.reason).sort()).toEqual(['bad_password', 'unknown_account']);
    expect(failed.find((f) => f.data.reason === 'unknown_account').actorType).toBe('anonymous');
    expect(JSON.stringify(await AuditLog.find().lean())).not.toMatch(
      /wrong-pass-1|ghost@shop\.test/,
    );
  });

  it('records password reset requests WITHOUT the one-time token', async () => {
    const ev = nextEvent(EVENTS.AUTH_PASSWORD_RESET_REQUESTED);
    await request(app).post('/api/v1/auth/staff/password/forgot').send({ email: 'root@shop.test' });
    const { token } = (await ev).payload;
    const entry = await auditOf('auth.passwordResetRequested');
    expect(entry.data.expiresAt).toBeTruthy();
    expect(JSON.stringify(entry)).not.toContain(token);
  });

  it('records role and staff changes with actor, before and after', async () => {
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ name: 'Auditor', permissions: ['audit.view'] });
    await request(app)
      .patch(`/api/v1/roles/${role.body.data.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ permissions: ['audit.view', 'report.view'] });
    const updated = await auditOf('role.updated');
    expect(updated).toMatchObject({
      actorId: expect.anything(),
      entityType: 'role',
      entityId: role.body.data.id,
    });
    expect(String(updated.actorId)).toBe(root.id);
    expect(updated.before.permissions).toEqual(['audit.view']);
    expect(updated.after.permissions).toEqual(['audit.view', 'report.view']);

    const staff = await createStaff(null, {
      name: 'Some One',
      email: 'one@shop.test',
      password: PW,
    });
    await request(app)
      .patch(`/api/v1/staff/${staff.id}`)
      .set('Authorization', `Bearer ${rootToken}`)
      .send({ status: 'disabled' });
    expect(await auditOf('staff.disabled', { entityId: staff.id })).toBeTruthy();
    expect((await auditOf('staff.updated', { entityId: staff.id })).after.status).toBe('disabled');
    expect(await auditOf('access.superAdminUsed')).toMatchObject({
      actorType: 'staff',
      entityType: 'request',
    });
  });

  it('is idempotent per event id and scrubs secret-looking fields as a last line of defense', async () => {
    const event = await eventBus.emit(EVENTS.AUTH_LOGGED_OUT, {
      principalType: 'staff',
      principalId: root.id,
    });
    const { recordEvent } = await import('../audit.service.js');
    await recordEvent(event); // re-delivery
    await waitFor(async () => (await AuditLog.countDocuments({ action: 'auth.loggedOut' })) === 1);
    expect(await AuditLog.countDocuments({ action: 'auth.loggedOut' })).toBe(1);
    expect(scrubSecrets({ a: { password: 'x', list: [{ token: 'y' }] }, ok: 1 })).toEqual({
      a: { password: '[REDACTED]', list: [{ token: '[REDACTED]' }] },
      ok: 1,
    });
  });
});

describe('GET /audit', () => {
  it('requires audit.view; filters and paginates newest first', async () => {
    const staff = await createStaff(null, {
      name: 'Some One',
      email: 'one@shop.test',
      password: PW,
    });
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'one@shop.test', password: PW })
    ).body.data.accessToken;
    expect(
      (await request(app).get('/api/v1/audit').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);

    await waitFor(
      async () => (await AuditLog.countDocuments({ action: 'auth.loginSucceeded' })) === 2,
    );
    const res = await request(app)
      .get(`/api/v1/audit?action=auth.loginSucceeded&limit=1`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0].entityId).toBe(staff.id); // newest first

    const byActor = await request(app)
      .get(`/api/v1/audit?actorId=${root.id}`)
      .set('Authorization', `Bearer ${rootToken}`);
    expect(byActor.body.data.every((e) => e.actorId === root.id)).toBe(true);
    const future = await request(app)
      .get('/api/v1/audit?from=2999-01-01T00:00:00Z')
      .set('Authorization', `Bearer ${rootToken}`);
    expect(future.body.meta.total).toBe(0);
    expect(
      (
        await request(app)
          .get('/api/v1/audit?action=made.up')
          .set('Authorization', `Bearer ${rootToken}`)
      ).status,
    ).toBe(400);
  });

  it('exposes no write endpoints', async () => {
    for (const method of ['post', 'patch', 'delete']) {
      expect(
        (await request(app)[method]('/api/v1/audit').set('Authorization', `Bearer ${rootToken}`))
          .status,
      ).toBe(404);
    }
  });
});
