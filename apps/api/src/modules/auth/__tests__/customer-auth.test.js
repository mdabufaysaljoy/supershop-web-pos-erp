import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { getCookie, nextEvent } from '../../../../test/http.js';
import { createApp } from '../../../app.js';
import { createStaff } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const BASE = '/api/v1/auth/customer';
const up = { db: () => true, redis: async () => true };
const newCustomer = {
  name: 'محمد العتيبي',
  email: 'Mohammed@Example.com',
  phone: '٠٥١٢٣٤٥٦٧٨',
  password: 'my-secret-pass-1',
};

let app;
beforeEach(() => {
  app = createApp({ checks: up });
});

const register = (body = newCustomer) => request(app).post('/api/v1/customers/register').send(body);
const login = (identifier, password = newCustomer.password) =>
  request(app).post(`${BASE}/login`).send({ identifier, password });

describe('customer registration', () => {
  it('creates the account, normalizes email/phone, logs in, and requests email verification', async () => {
    const verification = nextEvent(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED);
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data.profile).toMatchObject({
      name: 'محمد العتيبي',
      email: 'mohammed@example.com',
      phone: '+966512345678',
      emailVerified: false,
    });
    expect(getCookie(res, 'ss_rt_customer').attrs).toMatch(/Path=\/api\/v1\/auth\/customer/);
    expect((await verification).payload.token).toMatch(/^[\w-]{43}$/);
  });

  it('rejects duplicates with the conflicting fields', async () => {
    await register();
    const dup = await register({ ...newCustomer, email: 'other@example.com' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ fields: ['phone'] });
  });

  it('returns field-level i18n validation keys', async () => {
    const res = await register({ name: 'X1', email: 'bad', phone: '123', password: 'short1' });
    expect(res.status).toBe(400);
    const byPath = Object.fromEntries(res.body.error.details.map((d) => [d.path, d.message]));
    expect(byPath).toMatchObject({
      name: 'validation.name.invalid',
      email: 'validation.email.invalid',
      phone: 'validation.phone.ksaOnly',
      password: 'validation.password.tooShort',
    });
  });
});

describe('customer login', () => {
  beforeEach(async () => {
    await register();
  });

  it.each([
    ['mohammed@example.com'],
    ['MOHAMMED@example.com'],
    ['0512345678'],
    ['+966 51 234 5678'],
    ['٠٥١٢٣٤٥٦٧٨'],
  ])('accepts email or phone identifier %j', async (identifier) => {
    expect((await login(identifier)).status).toBe(200);
  });

  it('rejects wrong passwords generically', async () => {
    const res = await login('0512345678', 'wrong-pass-1');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('email verification', () => {
  it('verifies with a single-use token', async () => {
    const verification = nextEvent(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED);
    const reg = await register();
    const { token } = (await verification).payload;

    const verify = () => request(app).post(`${BASE}/email/verify`).send({ token });
    expect((await verify()).status).toBe(204);
    expect((await verify()).body.error.code).toBe('TOKEN_INVALID');

    const me = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(me.body.data.emailVerified).toBe(true);
  });

  it('resend requires auth and issues a new token', async () => {
    const reg = await register();
    expect((await request(app).post(`${BASE}/email/resend`)).status).toBe(401);
    const again = nextEvent(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED);
    const res = await request(app)
      .post(`${BASE}/email/resend`)
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(res.status).toBe(202);
    await expect(again).resolves.toBeDefined();
  });

  it('staff have no email-verify route', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/staff/email/verify')
          .send({ token: 'x'.repeat(43) })
      ).status,
    ).toBe(404);
  });
});

describe('principal isolation', () => {
  it('a customer token is useless on staff routes and vice versa', async () => {
    const customerToken = (await register()).body.data.accessToken;
    await createStaff({ name: 'Sara Admin', email: 'sara@shop.test', password: 'correct-horse-9' });
    const staffToken = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'sara@shop.test', password: 'correct-horse-9' })
    ).body.data.accessToken;

    const staffMe = await request(app)
      .get('/api/v1/auth/staff/me')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(staffMe.status).toBe(401);
    expect(staffMe.body.error.code).toBe('TOKEN_INVALID');
    const custMe = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(custMe.status).toBe(401);
  });

  it('a staff email cannot log in as a customer (separate accounts)', async () => {
    await createStaff({ name: 'Sara Admin', email: 'sara@shop.test', password: 'correct-horse-9' });
    expect((await login('sara@shop.test', 'correct-horse-9')).status).toBe(401);
  });
});
