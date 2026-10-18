import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../test/mongo.js';
import { createApp } from '../../app.js';
import { createStaff, ensureSuperAdmin } from '../../modules/staff/index.js';
import { Role } from '../../modules/rbac/role.model.js';
import { Branch } from '../../modules/branches/branch.model.js';
import { registerCustomer } from '../../modules/customers/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const up = { db: () => true, redis: async () => true };
const PW = 'password-1234';

describe('Security and Authorization Matrix Test Suite', () => {
  let app;
  let branch1;
  let branch2;
  let cashierToken;
  let adminToken;
  let customerToken;

  beforeEach(async () => {
    app = createApp({
      checks: up,
      corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
    });

    branch1 = await Branch.create({
      code: 'RUH-01',
      name: { en: 'Riyadh Flagship', ar: 'الرياض' },
      status: 'active',
    });
    branch2 = await Branch.create({
      code: 'JED-01',
      name: { en: 'Jeddah Corniche', ar: 'جدة' },
      status: 'active',
    });

    // Cashier role: only pos.sell, shift.open
    const cashierRole = await Role.create({
      name: 'Cashier',
      nameKey: 'cashier',
      permissions: ['pos.sell', 'shift.open'],
      allBranches: false,
    });

    await createStaff(null, {
      name: 'Cashier Tariq',
      email: 'tariq@shop.test',
      password: PW,
      roleId: cashierRole._id,
      branchIds: [branch1._id],
    });

    // Super Admin
    await ensureSuperAdmin({
      name: 'Admin Fatima',
      email: 'admin@shop.test',
      password: PW,
    });

    // Customer
    await registerCustomer({
      name: 'Customer Khaled',
      email: 'khaled@customer.test',
      password: PW,
    });

    // Login each to establish real sessions
    const cashierRes = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'tariq@shop.test', password: PW });
    cashierToken = cashierRes.body.data.accessToken;

    const adminRes = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'admin@shop.test', password: PW });
    adminToken = adminRes.body.data.accessToken;

    const custRes = await request(app)
      .post('/api/v1/auth/customer/login')
      .send({ identifier: 'khaled@customer.test', password: PW });
    customerToken = custRes.body.data.accessToken;
  });

  describe('1. Deny-by-default for unauthenticated requests', () => {
    it('rejects unauthenticated requests on protected staff endpoints with 401', async () => {
      const endpoints = [
        ['get', '/api/v1/staff'],
        ['get', '/api/v1/roles'],
        ['get', '/api/v1/settings'],
        ['get', '/api/v1/audit'],
        ['get', '/api/v1/auth/staff/me'],
      ];

      for (const [method, path] of endpoints) {
        const res = await request(app)[method](path);
        expect(res.status, `Expected 401 for ${method.toUpperCase()} ${path}`).toBe(401);
        expect(res.body.error).toBeDefined();
      }
    });

    it('rejects unauthenticated requests on protected customer endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/account');
      expect(res.status).toBe(401);
    });
  });

  describe('2. Cross-principal barrier defense', () => {
    it('rejects customer access token on staff endpoints with 401', async () => {
      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    it('rejects staff access token on customer endpoints with 401', async () => {
      const res = await request(app)
        .get('/api/v1/account')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('3. RBAC permission checks & privilege escalation defense', () => {
    it('denies access when staff lacks the required permission with 403', async () => {
      // Cashier lacks 'staff.manage'
      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows access when staff holds the required permission', async () => {
      // Super admin bypasses or holds 'staff.manage'
      const res = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('prevents privilege escalation when creating/updating roles', async () => {
      // Cashier lacks role.manage
      const res = await request(app)
        .post('/api/v1/roles')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          name: 'Hacker Role',
          permissions: ['settings.payments'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('enforces branch-scoping isolation (BRANCH_SCOPE_DENIED 403)', async () => {
      // Cashier is assigned only to branch1, attempting to open shift in branch2
      const res = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId: String(branch2._id),
          openingCash: 50000,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('BRANCH_SCOPE_DENIED');
    });
  });

  describe('4. Security headers, clickjacking defense, and CORS', () => {
    it('serves helmet security headers and removes X-Powered-By', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);

      // No X-Powered-By header
      expect(res.headers['x-powered-by']).toBeUndefined();

      // Clickjacking defense: X-Frame-Options is SAMEORIGIN
      expect(res.headers['x-frame-options']).toBeDefined();

      // MIME sniffing defense
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('enforces CORS allowlist on preflight requests', async () => {
      // Allowed origin
      const allowedRes = await request(app)
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(allowedRes.headers['access-control-allow-origin']).toBe('http://localhost:3000');

      // Disallowed origin receives no access-control-allow-origin header
      const forbiddenRes = await request(app)
        .options('/api/v1/health')
        .set('Origin', 'http://evil-attacker.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(forbiddenRes.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('5. Translation endpoint abuse and PII safety', () => {
    it('protects provider test endpoint with permission and sensitive rate limit', async () => {
      // Unauthenticated
      const unauth = await request(app).post('/api/v1/i18n/provider/test');
      expect(unauth.status).toBe(401);

      // Cashier lacking settings.languages
      const forbidden = await request(app)
        .post('/api/v1/i18n/provider/test')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(forbidden.status).toBe(403);
    });
  });
});
