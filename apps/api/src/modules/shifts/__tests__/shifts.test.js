import { ERROR_CODES, previewLines } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { Shift, ZReport } from '../shift.model.js';

/**
 * P6.5 — Cashier shifts: open/close with cash count, role-based shift rules, X-report, Z-report
 * (+ thermal print), cash in/out, and `pos.requireOpenShift`.
 */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
const tokens = {};
const ids = {};

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

const as = (who) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[who]}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${tokens[who]}`).send(body),
  del: (url) => request(app).delete(url).set('Authorization', `Bearer ${tokens[who]}`),
});

const login = async (email) =>
  (await request(app).post('/api/v1/auth/staff/login').send({ email, password: PW })).body.data
    .accessToken;

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Order.init(), Shift.init(), ZReport.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  tokens.root = await login('root@shop.test');

  ids.shop = (
    await ok(
      await as('root').post('/api/v1/branches', {
        code: 'SHOP',
        name: 'Main Shop',
        fulfillsOnlineOrders: false,
      }),
      201,
    )
  ).id;
  ids.otherBranch = (
    await ok(await as('root').post('/api/v1/branches', { code: 'NORTH', name: 'North' }), 201)
  ).id;

  const cashierRoleId = await findSystemRoleId('cashier');
  const managerRoleId = await findSystemRoleId('store_manager');

  await createStaff(null, {
    name: 'Cara Cashier',
    email: 'cara@shop.test',
    password: PW,
    roleId: cashierRoleId,
    branchIds: [ids.shop],
  });
  await createStaff(null, {
    name: 'Bob Cashier',
    email: 'bob@shop.test',
    password: PW,
    roleId: cashierRoleId,
    branchIds: [ids.shop],
  });
  await createStaff(null, {
    name: 'Mona Manager',
    email: 'mona@shop.test',
    password: PW,
    roleId: managerRoleId,
    branchIds: [ids.shop],
  });

  tokens.cara = await login('cara@shop.test');
  tokens.bob = await login('bob@shop.test');
  tokens.mona = await login('mona@shop.test');

  const product = await ok(
    await as('root').post('/api/v1/products', {
      name: 'Coffee Beans',
      status: 'active',
      variants: [{ sku: 'COF-1', optionValues: {}, price: 11_500 }],
    }),
    201,
  );
  ids.variant = product.variants[0].id;

  await ok(
    await as('root').post('/api/v1/inventory/receive', {
      branchId: ids.shop,
      lines: [{ variantId: ids.variant, qty: 20, unitCost: 5000 }],
    }),
    201,
  );

  await ok(
    await as('root').post('/api/v1/printing/profiles', {
      name: 'Counter Epson',
      printer: 'EPSON-TM-T20',
      kind: 'receipt',
      widthMm: 80,
      branchId: ids.shop,
      cut: true,
      openDrawer: true,
      isDefault: true,
    }),
    201,
  );
});

describe('opening shifts & POS integration', () => {
  it('enforces pos.requireOpenShift when enabled and links POS sales to the open shift', async () => {
    await ok(
      await as('root').patch('/api/v1/settings', {
        changes: [{ key: 'pos.requireOpenShift', value: true }],
      }),
    );

    // Without an open shift, ringing up a sale is refused with SHIFT_NOT_OPEN.
    const refused = await as('cara').post('/api/v1/pos/sales', {
      branchId: ids.shop,
      items: [{ variantId: ids.variant, qty: 1 }],
      payments: [{ method: 'cash', amount: 11_500 }],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe(ERROR_CODES.SHIFT_NOT_OPEN);

    // Cara opens a shift with SAR 500.00 float.
    const shift = await ok(
      await as('cara').post('/api/v1/shifts/open', {
        branchId: ids.shop,
        openingCash: 50_000,
        note: 'Morning float',
      }),
      201,
    );
    expect(shift).toMatchObject({
      shiftNo: 'SHF-000001',
      status: 'open',
      openingCash: 50_000,
      expectedCash: 50_000,
      openedByName: 'Cara Cashier',
    });

    // Opening a second shift while one is open fails with 409 CONFLICT.
    const dup = await as('cara').post('/api/v1/shifts/open', {
      branchId: ids.shop,
      openingCash: 10_000,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe(ERROR_CODES.CONFLICT);

    // Out-of-scope branch is refused with 403 BRANCH_SCOPE_DENIED.
    const wrongBranch = await as('bob').post('/api/v1/shifts/open', {
      branchId: ids.otherBranch,
      openingCash: 10_000,
    });
    expect(wrongBranch.status).toBe(403);
    expect(wrongBranch.body.error.code).toBe(ERROR_CODES.BRANCH_SCOPE_DENIED);

    // Now the counter sale succeeds and links to Cara's open shift.
    const sale = await ok(
      await as('cara').post('/api/v1/pos/sales', {
        branchId: ids.shop,
        items: [{ variantId: ids.variant, qty: 2 }],
        payments: [{ method: 'cash', amount: 25_000 }], // total 23,000, change 2,000
      }),
      201,
    );
    expect(sale.shiftId).toBe(shift.id);

    // Current shift endpoint reflects live sales and expected drawer cash (50,000 + 23,000 = 73,000).
    const current = await ok(await as('cara').get(`/api/v1/shifts/current?branchId=${ids.shop}`));
    expect(current.summary).toMatchObject({
      openingCash: 50_000,
      cashSales: 23_000,
      expectedCash: 73_000,
      sales: { count: 1, itemCount: 2, total: 23_000 },
    });
  });
});

describe('cash in/out, X-Report, role-based closing rules, Z-Report & thermal printing', () => {
  it('enforces shift.cashMovement, computes X-report, enforces own-shift & discrepancy rules, and prints Z-report', async () => {
    const shift = await ok(
      await as('cara').post('/api/v1/shifts/open', {
        branchId: ids.shop,
        openingCash: 50_000,
      }),
      201,
    );

    // Ring up one cash sale (11,500)
    await ok(
      await as('cara').post('/api/v1/pos/sales', {
        branchId: ids.shop,
        items: [{ variantId: ids.variant, qty: 1 }],
        payments: [{ method: 'cash', amount: 11_500 }],
      }),
      201,
    );

    // Cashier does NOT hold shift.cashMovement by default -> 403
    const deniedMove = await as('cara').post(`/api/v1/shifts/${shift.id}/movements`, {
      type: 'out',
      amount: 2000,
      reason: 'Petty cash',
    });
    expect(deniedMove.status).toBe(403);

    // Store Manager holds shift.cashMovement -> records cash in (+5,000) and cash out (-1,500)
    await ok(
      await as('mona').post(`/api/v1/shifts/${shift.id}/movements`, {
        type: 'in',
        amount: 5000,
        reason: 'Small change top-up',
      }),
    );
    const afterMove = await ok(
      await as('mona').post(`/api/v1/shifts/${shift.id}/movements`, {
        type: 'out',
        amount: 1500,
        reason: 'Receipt rolls',
      }),
    );
    // Expected cash = 50,000 + 11,500 + 5,000 - 1,500 = 65,000
    expect(afterMove.summary.expectedCash).toBe(65_000);

    // Cash out exceeding expected cash in drawer is refused (409)
    const tooMuchOut = await as('mona').post(`/api/v1/shifts/${shift.id}/movements`, {
      type: 'out',
      amount: 90_000,
      reason: 'Too much',
    });
    expect(tooMuchOut.status).toBe(409);

    // Mid-shift X-Report leaves shift open and returns summary + thermal lines
    const xReport = await ok(await as('cara').get(`/api/v1/shifts/${shift.id}/x-report`));
    expect(xReport.kind).toBe('x');
    expect(xReport.shift.status).toBe('open');
    expect(xReport.summary.expectedCash).toBe(65_000);
    expect(xReport.lines.join('\n')).toContain('X-REPORT (MID-SHIFT)');

    // Thermal print job for X-Report and cash-drawer kick
    const xJob = await ok(await as('cara').post(`/api/v1/shifts/${shift.id}/print`, {}));
    expect(xJob.printer).toBe('EPSON-TM-T20');
    expect(xJob.kind).toBe('x');
    expect(previewLines(Buffer.from(xJob.data, 'base64')).join('\n')).toContain('SHF-000001');

    const drawerJob = await ok(
      await as('cara').post('/api/v1/shifts/drawer', { branchId: ids.shop }),
    );
    expect(drawerJob.printer).toBe('EPSON-TM-T20');
    expect(drawerJob.data).toBeTruthy();

    // Role-based rule 1: Bob (another cashier) cannot close Cara's shift (403)
    const bobClose = await as('bob').post(`/api/v1/shifts/${shift.id}/close`, {
      closingCash: 65_000,
    });
    expect(bobClose.status).toBe(403);

    // Role-based rule 2: set pos.shiftMaxDiscrepancy = 2000 (SAR 20.00); Cara cannot close with SAR 50.00 shortage
    await ok(
      await as('root').patch('/api/v1/settings', {
        changes: [{ key: 'pos.shiftMaxDiscrepancy', value: 2000 }],
      }),
    );
    const caraBigDiscrepancy = await as('cara').post(`/api/v1/shifts/${shift.id}/close`, {
      closingCash: 60_000, // -5,000 discrepancy (> 2,000 cap)
    });
    expect(caraBigDiscrepancy.status).toBe(403);

    // Manager Mona CAN close the shift with the -5,000 discrepancy -> generates Z-000001
    const closed = await ok(
      await as('mona').post(`/api/v1/shifts/${shift.id}/close`, {
        closingCash: 60_000,
        note: 'Short SAR 50 verified by manager',
      }),
    );
    expect(closed.shift.status).toBe('closed');
    expect(closed.shift.zReportNo).toBe('Z-000001');
    expect(closed.zReport).toMatchObject({
      zReportNo: 'Z-000001',
      shiftNo: 'SHF-000001',
      openingCash: 50_000,
      closingCash: 60_000,
      expectedCash: 65_000,
      discrepancy: -5000,
      closedByName: 'Mona Manager',
    });

    // Closing an already-closed shift fails with 409 SHIFT_NOT_OPEN
    const closeAgain = await as('mona').post(`/api/v1/shifts/${shift.id}/close`, {
      closingCash: 60_000,
    });
    expect(closeAgain.status).toBe(409);
    expect(closeAgain.body.error.code).toBe(ERROR_CODES.SHIFT_NOT_OPEN);

    // Z-Report endpoint and thermal print
    const zReport = await ok(await as('cara').get(`/api/v1/shifts/${shift.id}/z-report`));
    expect(zReport.zReportNo).toBe('Z-000001');
    expect(zReport.lines.join('\n')).toContain('Z-REPORT (END OF SHIFT)');

    const zJob = await ok(await as('cara').post(`/api/v1/shifts/${shift.id}/print`, {}));
    expect(zJob.kind).toBe('z');
    expect(previewLines(Buffer.from(zJob.data, 'base64')).join('\n')).toContain('Z-000001');

    // ZReport is immutable in Mongo
    await expect(
      ZReport.updateOne({ _id: zReport.id }, { $set: { closingCash: 99_999 } }),
    ).rejects.toThrow(/immutable/);

    // Branch with shift history cannot be deleted
    const delBranch = await as('root').del(`/api/v1/branches/${ids.shop}`);
    expect(delBranch.status).toBe(409);
    expect(delBranch.body.error.code).toBe(ERROR_CODES.BRANCH_IN_USE);
  });

  it('lists shifts by branch and status and records shift events in the audit log', async () => {
    const s1 = await ok(
      await as('cara').post('/api/v1/shifts/open', {
        branchId: ids.shop,
        openingCash: 30_000,
      }),
      201,
    );
    await ok(
      await as('mona').post(`/api/v1/shifts/${s1.id}/movements`, {
        type: 'in',
        amount: 2500,
        reason: 'Float adjustment',
      }),
    );
    await ok(
      await as('cara').post(`/api/v1/shifts/${s1.id}/close`, {
        closingCash: 32_500,
      }),
    );

    const s2 = await ok(
      await as('bob').post('/api/v1/shifts/open', {
        branchId: ids.shop,
        openingCash: 20_000,
      }),
      201,
    );

    const openList = await ok(
      await as('mona').get(`/api/v1/shifts?branchId=${ids.shop}&status=open`),
    );
    expect(openList.map((s) => s.id)).toEqual([s2.id]);

    const closedList = await ok(
      await as('mona').get(`/api/v1/shifts?branchId=${ids.shop}&status=closed`),
    );
    expect(closedList.map((s) => s.id)).toEqual([s1.id]);

    const detail = await ok(await as('mona').get(`/api/v1/shifts/${s1.id}`));
    expect(detail.status).toBe('closed');
    expect(detail.discrepancy).toBe(0);

    // Audit trail records shift.opened, shift.cashMoved, and shift.closed
    let actions = [];
    for (let i = 0; i < 10; i++) {
      const audit = await ok(await as('root').get('/api/v1/audit?entityType=shift'));
      actions = audit.map((e) => e.action);
      if (actions.length >= 3) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(actions).toContain('shift.opened');
    expect(actions).toContain('shift.cashMoved');
    expect(actions).toContain('shift.closed');
  });
});
