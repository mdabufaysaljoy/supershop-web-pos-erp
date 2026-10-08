import { EVENTS } from '@supershop/shared';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { csrfHeaders, getCookie, nextEvent } from '../../../../test/http.js';
import { createApp } from '../../../app.js';
import { createStaff } from '../../staff/index.js';
import { Credential, Session } from '../auth.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const COOKIE = 'ss_rt_staff';
const BASE = '/api/v1/auth/staff';
const PASSWORD = 'correct-horse-9';
const up = { db: () => true, redis: async () => true };

let app;
let staff;

beforeEach(async () => {
  app = createApp({ checks: up }); // fresh rate-limit counters per test
  staff = await createStaff({ name: 'Sara Admin', email: 'sara@shop.test', password: PASSWORD });
});

const login = (body = { email: 'sara@shop.test', password: PASSWORD }) =>
  request(app).post(`${BASE}/login`).send(body);

const refresh = (cookieValue, headers = csrfHeaders) =>
  request(app).post(`${BASE}/refresh`).set(headers).set('Cookie', `${COOKIE}=${cookieValue}`);

const me = (token) => request(app).get(`${BASE}/me`).set('Authorization', `Bearer ${token}`);

describe('staff login', () => {
  it('returns an access token + profile and sets a hardened refresh cookie', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(res.body.data.profile).toMatchObject({ id: staff.id, email: 'sara@shop.test' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const cookie = getCookie(res, COOKIE);
    expect(cookie.value).toMatch(/^[a-f\d]{24}\.[\w-]{43}$/);
    expect(cookie.attrs).toMatch(/HttpOnly/);
    expect(cookie.attrs).toMatch(/SameSite=Strict/);
    expect(cookie.attrs).toMatch(/Path=\/api\/v1\/auth\/staff/);
  });

  it('normalizes email case/whitespace', async () => {
    expect((await login({ email: '  SARA@Shop.Test ', password: PASSWORD })).status).toBe(200);
  });

  it('gives identical answers for wrong password and unknown account', async () => {
    const wrong = await login({ email: 'sara@shop.test', password: 'nope-nope-1' });
    const unknown = await login({ email: 'ghost@shop.test', password: 'nope-nope-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(getCookie(wrong, COOKIE)).toBeNull();
  });

  it('validates input with i18n keys and rejects operator injection', async () => {
    const bad = await login({ email: 'not-an-email' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email', message: 'validation.email.invalid' }),
        expect.objectContaining({ path: 'password', message: 'validation.required' }),
      ]),
    );
    const inj = await login({ email: { $gt: '' }, password: { $ne: null } });
    expect(inj.status).toBe(400);
    expect(inj.body.error.code).toBe('BAD_REQUEST');
  });

  it('locks the account after 5 failures; only the right password learns it is locked', async () => {
    for (let i = 0; i < 4; i += 1)
      await login({ email: 'sara@shop.test', password: `wrong-pass-${i}` });
    const locking = nextEvent(EVENTS.AUTH_ACCOUNT_LOCKED);
    await login({ email: 'sara@shop.test', password: 'wrong-pass-5' });
    await expect(locking).resolves.toMatchObject({ payload: { principalId: staff.id } });

    const right = await login();
    expect(right.status).toBe(423);
    expect(right.body.error.code).toBe('ACCOUNT_LOCKED');
    const wrong = await login({ email: 'sara@shop.test', password: 'still-wrong-1' });
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    // Lock expiry → login works again and the counter is reset.
    await Credential.updateOne({}, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await login()).status).toBe(200);
    expect((await Credential.findOne().lean()).failedLoginCount).toBe(0);
  });

  it('rejects disabled accounts only after a correct password', async () => {
    const { Staff } = await import('../../staff/staff.model.js');
    await Staff.updateOne({}, { $set: { status: 'disabled' } });
    expect((await login()).body.error.code).toBe('ACCOUNT_DISABLED');
    expect(
      (await login({ email: 'sara@shop.test', password: 'bad-pass-123' })).body.error.code,
    ).toBe('INVALID_CREDENTIALS');
  });

  it('rate-limits repeated attempts on one identifier (429, envelope)', async () => {
    let last;
    for (let i = 0; i < 11; i += 1) last = await login({ email: 'ghost@shop.test', password: 'x' });
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('access tokens', () => {
  it('authorizes /me; rejects missing, malformed, forged, and expired tokens', async () => {
    const { accessToken } = (await login()).body.data;
    expect((await me(accessToken)).body.data.id).toBe(staff.id);

    expect((await request(app).get(`${BASE}/me`)).body.error.code).toBe('UNAUTHENTICATED');
    expect((await me('garbage')).status).toBe(401);

    const forged = await new SignJWT({ typ: 'staff', sid: '0'.repeat(24) })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(staff.id)
      .setIssuer('supershop-api')
      .setAudience('supershop:staff')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('attacker-secret-attacker-secret-0000'));
    expect((await me(forged)).body.error.code).toBe('TOKEN_INVALID');

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + 16 * 60_000);
      expect((await me(accessToken)).body.error.code).toBe('TOKEN_EXPIRED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects "alg: none" tokens', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none' })}.${b64({ sub: staff.id, typ: 'staff', aud: 'supershop:staff' })}.`;
    expect((await me(none)).status).toBe(401);
  });
});

describe('refresh rotation', () => {
  it('requires the CSRF header and an allowed Origin', async () => {
    const cookie = getCookie(await login(), COOKIE).value;
    expect((await refresh(cookie, {})).body.error.code).toBe('CSRF_FAILED');
    expect((await refresh(cookie, { ...csrfHeaders, Origin: 'https://evil.example' })).status).toBe(
      403,
    );
    expect((await refresh(cookie, { 'X-CSRF-Protection': '1' })).status).toBe(403); // no origin
    expect((await refresh(cookie)).status).toBe(200);
  });

  it('rotates the refresh token and issues a working access token', async () => {
    const first = getCookie(await login(), COOKIE).value;
    const res = await refresh(first);
    const second = getCookie(res, COOKIE).value;
    expect(second).not.toBe(first);
    expect(second.split('.')[0]).toBe(first.split('.')[0]); // same session
    expect((await me(res.body.data.accessToken)).status).toBe(200);
  });

  it('detects reuse of an old refresh token and revokes the whole session', async () => {
    const t1 = getCookie(await login(), COOKIE).value;
    const r2 = await refresh(t1);
    const t2 = getCookie(r2, COOKIE).value;
    const t3 = getCookie(await refresh(t2), COOKIE).value;

    const reuse = nextEvent(EVENTS.AUTH_REFRESH_REUSE_DETECTED);
    const stolen = await refresh(t1); // two rotations old → definitely reuse
    expect(stolen.status).toBe(401);
    await expect(reuse).resolves.toBeDefined();

    // The legitimate holder is logged out too (family revoked) and access tokens die immediately.
    expect((await refresh(t3)).status).toBe(401);
    expect((await me(r2.body.data.accessToken)).body.error.code).toBe('TOKEN_INVALID');
  });

  it('tolerates a concurrent double refresh (grace window) without revoking', async () => {
    const t1 = getCookie(await login(), COOKIE).value;
    const t2 = getCookie(await refresh(t1), COOKIE).value;
    expect((await refresh(t1)).status).toBe(401); // lost the race…
    expect((await refresh(t2)).status).toBe(200); // …but the session survives
  });

  it('rejects malformed, unknown and expired refresh tokens and clears the cookie', async () => {
    const bad = await refresh('nonsense');
    expect(bad.status).toBe(401);
    expect(getCookie(bad, COOKIE).attrs).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refresh(`${'a'.repeat(24)}.${'b'.repeat(43)}`)).status).toBe(401);

    const t = getCookie(await login(), COOKIE).value;
    await Session.updateOne({}, { $set: { idleExpiresAt: new Date(Date.now() - 1) } });
    expect((await refresh(t)).status).toBe(401);
  });

  it('revokes sessions when the staff member is disabled', async () => {
    const t = getCookie(await login(), COOKIE).value;
    const { Staff } = await import('../../staff/staff.model.js');
    await Staff.updateOne({}, { $set: { status: 'disabled' } });
    expect((await refresh(t)).status).toBe(401);
    expect((await Session.findOne().lean()).revokeReason).toBe('principal_inactive');
  });
});

describe('logout', () => {
  it('logout ends the session immediately (refresh + access token)', async () => {
    const res = await login();
    const cookie = getCookie(res, COOKIE).value;
    const out = await request(app)
      .post(`${BASE}/logout`)
      .set(csrfHeaders)
      .set('Cookie', `${COOKIE}=${cookie}`);
    expect(out.status).toBe(204);
    expect((await refresh(cookie)).status).toBe(401);
    expect((await me(res.body.data.accessToken)).status).toBe(401);
  });

  it('logout-all ends every session of the user', async () => {
    const a = await login();
    const b = await login();
    await request(app)
      .post(`${BASE}/logout-all`)
      .set('Authorization', `Bearer ${a.body.data.accessToken}`)
      .expect(204);
    expect((await me(b.body.data.accessToken)).status).toBe(401);
    expect(await Session.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('caps concurrent sessions (oldest revoked)', async () => {
    const first = await login();
    for (let i = 0; i < 10; i += 1) await login();
    expect(await Session.countDocuments({ revokedAt: null })).toBe(10);
    expect((await me(first.body.data.accessToken)).status).toBe(401);
  });
});

describe('passwords', () => {
  it('change: verifies current password, keeps this session, ends the others', async () => {
    const here = await login();
    const elsewhere = await login();
    const change = (body) =>
      request(app)
        .post(`${BASE}/password/change`)
        .set('Authorization', `Bearer ${here.body.data.accessToken}`)
        .send(body);

    expect(
      (await change({ currentPassword: 'wrong-pass-1', newPassword: 'brand-new-pass-1' })).status,
    ).toBe(401);
    expect(
      (await change({ currentPassword: PASSWORD, newPassword: 'short' })).body.error.details[0]
        .message,
    ).toBe('validation.password.tooShort');
    expect(
      (await change({ currentPassword: PASSWORD, newPassword: 'brand-new-pass-1' })).status,
    ).toBe(204);

    expect((await me(here.body.data.accessToken)).status).toBe(200);
    expect((await me(elsewhere.body.data.accessToken)).status).toBe(401);
    expect((await login()).status).toBe(401);
    expect((await login({ email: 'sara@shop.test', password: 'brand-new-pass-1' })).status).toBe(
      200,
    );
  });

  it('forgot → reset: same response for unknown emails, single-use token, sessions revoked', async () => {
    const before = await login();
    const unknown = await request(app)
      .post(`${BASE}/password/forgot`)
      .send({ email: 'ghost@shop.test' });
    expect(unknown.status).toBe(202);

    const requested = nextEvent(EVENTS.AUTH_PASSWORD_RESET_REQUESTED);
    const known = await request(app)
      .post(`${BASE}/password/forgot`)
      .send({ email: 'sara@shop.test' });
    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    const { token } = (await requested).payload;

    const reset = (body) => request(app).post(`${BASE}/password/reset`).send(body);
    expect((await reset({ token, password: 'weak' })).status).toBe(400);
    expect((await reset({ token, password: 'reset-pass-77' })).status).toBe(204);
    expect((await reset({ token, password: 'again-pass-77' })).body.error.code).toBe(
      'TOKEN_INVALID',
    );

    expect((await me(before.body.data.accessToken)).status).toBe(401);
    expect((await login({ email: 'sara@shop.test', password: 'reset-pass-77' })).status).toBe(200);
  });

  it('a newer reset link invalidates the older one; expired links fail', async () => {
    const e1 = nextEvent(EVENTS.AUTH_PASSWORD_RESET_REQUESTED);
    await request(app).post(`${BASE}/password/forgot`).send({ email: 'sara@shop.test' });
    const old = (await e1).payload.token;
    const e2 = nextEvent(EVENTS.AUTH_PASSWORD_RESET_REQUESTED);
    await request(app).post(`${BASE}/password/forgot`).send({ email: 'sara@shop.test' });
    const fresh = (await e2).payload.token;

    const reset = (token) =>
      request(app).post(`${BASE}/password/reset`).send({ token, password: 'reset-pass-77' });
    expect((await reset(old)).status).toBe(400);

    const { AuthToken } = await import('../auth.model.js');
    await AuthToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1) } });
    expect((await reset(fresh)).status).toBe(400);
  });

  it('stores only argon2id hashes', async () => {
    const cred = await Credential.findOne().lean();
    expect(cred.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });
});
