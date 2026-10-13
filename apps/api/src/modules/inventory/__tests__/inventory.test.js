import { EVENTS, PERMISSIONS as P } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { withTransaction } from '../../../core/db.js';
import { eventBus } from '../../../core/events.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { applyStockOperation, publishStockResult } from '../index.js';
import { StockLevel, StockMovement, StockOperation } from '../stock.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
const tokens = {};
const ids = {};
const events = [];
const offs = [];

const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body, key) => {
      const r = auth(request(app).post(url));
      return (key ? r.set('Idempotency-Key', key) : r).send(body);
    },
    put: (url, body) => auth(request(app).put(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const ok = async (res, status = 201) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const login = async (who) => {
  const res = await request(app)
    .post('/api/v1/auth/staff/login')
    .send({ email: `${who}@shop.test`, password: PW });
  tokens[who] = res.body.data.accessToken;
};
const onHand = async (variantId, branchId) =>
  (await StockLevel.findOne({ variantId, branchId }).lean())?.onHand ?? null;
const receive = (who, branchId, lines, extra = {}) =>
  as(who).post('/api/v1/inventory/receive', { branchId, lines, ...extra });
/** Ledger invariant: every level equals the sum of its movements and the last running balance. */
async function expectLedgerConsistent() {
  for (const level of await StockLevel.find().lean()) {
    const rows = await StockMovement.find({ variantId: level.variantId, branchId: level.branchId })
      .sort({ _id: 1 })
      .lean();
    expect(rows.reduce((s, m) => s + m.delta, 0)).toBe(level.onHand);
    if (rows.length) expect(rows.at(-1).balanceAfter).toBe(level.onHand);
  }
}

beforeAll(() => {
  for (const name of [EVENTS.STOCK_MOVED, EVENTS.STOCK_LOW, EVENTS.STOCK_OUT])
    offs.push(eventBus.on(name, (e) => events.push(e)));
});
afterAll(() => offs.forEach((off) => off()));

beforeEach(async () => {
  events.length = 0;
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([StockLevel.init(), StockOperation.init(), StockMovement.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  await login('root');

  ids.ruh = (
    await ok(await as('root').post('/api/v1/branches', { code: 'RUH', name: 'Riyadh' }))
  ).id;
  ids.jed = (
    await ok(await as('root').post('/api/v1/branches', { code: 'JED', name: 'Jeddah' }))
  ).id;
  const shirt = await ok(
    await as('root').post('/api/v1/products', {
      name: 'Oxford Shirt',
      options: [{ name: 'Color', values: [{ label: 'Red' }, { label: 'Blue' }] }],
      variants: [
        { sku: 'OX-RED', optionValues: { color: 'red' }, price: 9900, cost: 4000 },
        { sku: 'OX-BLUE', optionValues: { color: 'blue' }, price: 9900 },
      ],
    }),
  );
  ids.red = shirt.variants.find((v) => v.sku === 'OX-RED').id;
  ids.blue = shirt.variants.find((v) => v.sku === 'OX-BLUE').id;
  ids.shirt = shirt.id;
  ids.rice = (
    await ok(
      await as('root').post('/api/v1/products', {
        name: 'Basmati Rice',
        variants: [{ sku: 'RICE-5', barcode: '6281000000007', price: 3450 }],
      }),
    )
  ).variants[0].id;

  const roles = {
    clerk: [P.INVENTORY_VIEW, P.INVENTORY_ADJUST, P.INVENTORY_RECEIVE, P.INVENTORY_TRANSFER],
    seller: [P.POS_SELL],
  };
  for (const [who, permissions] of Object.entries(roles)) {
    const role = await ok(
      await as('root').post('/api/v1/roles', {
        name: `Role ${who}`,
        permissions,
        allBranches: false,
      }),
    );
    await createStaff(null, {
      name: 'Staff Member',
      email: `${who}@shop.test`,
      password: PW,
      roleId: role.id,
      branchIds: [ids.ruh],
    });
    await login(who);
  }
});

describe('receive', () => {
  it('books stock with a document number, running balances and audit; cost only with viewCost', async () => {
    const op = await ok(
      await receive(
        'root',
        ids.ruh,
        [
          { variantId: ids.red, qty: 10, unitCost: 4100 },
          { variantId: ids.rice, qty: 3 },
        ],
        { reference: 'INV-778', note: 'First delivery' },
      ),
    );
    expect(op).toMatchObject({
      type: 'receive',
      docNo: 'GRN-000001',
      branch: { code: 'RUH' },
      reference: 'INV-778',
      lineCount: 2,
    });
    expect(op.movements).toHaveLength(2);
    expect(op.actor).toMatchObject({ name: 'Root Admin' });
    expect(op.movements[0].actor).toMatchObject({ name: 'Root Admin' });
    const red = op.movements.find((m) => m.variant.sku === 'OX-RED');
    expect(red).toMatchObject({ type: 'receive', delta: 10, balanceAfter: 10, unitCost: 4100 });
    expect(red.variant.options[0]).toMatchObject({ name: { en: 'Color' }, value: { en: 'Red' } });

    const again = await ok(
      await receive('clerk', ids.ruh, [{ variantId: ids.red, qty: 5, unitCost: 4200 }]),
    );
    expect(again.docNo).toBe('GRN-000002');
    expect(again.movements[0]).toMatchObject({ balanceAfter: 15 });
    expect(again.movements[0]).not.toHaveProperty('unitCost');
    expect(await onHand(ids.red, ids.ruh)).toBe(15);

    const moved = events.find((e) => e.name === EVENTS.STOCK_MOVED);
    expect(moved.payload).toMatchObject({ type: 'receive', docNo: 'GRN-000001' });
    const audit = await waitFor(async () => {
      const res = await as('root').get('/api/v1/audit?action=stock.moved');
      return res.body.data.length >= 2 ? res.body.data : null;
    });
    expect(audit[1].data).toMatchObject({ docNo: 'GRN-000001', lineCount: 2 });
  });

  it('rejects unknown/deleted variants and branches, duplicates and bad quantities', async () => {
    await as('root').delete(`/api/v1/products/${ids.shirt}`);
    const res = await receive('root', ids.ruh, [
      { variantId: ids.rice, qty: 1 },
      { variantId: ids.red, qty: 1 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ path: 'lines.1.variantId' }),
    ]);

    const branch = await receive('root', '64b000000000000000000009', [
      { variantId: ids.rice, qty: 1 },
    ]);
    expect(branch.status).toBe(400);
    expect(branch.body.error.details[0].path).toBe('branchId');

    const bad = await receive('root', ids.ruh, [
      { variantId: ids.rice, qty: 0 },
      { variantId: ids.rice, qty: 2.5 },
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['lines.0.qty', 'lines.1.qty']),
    );
    const dup = await receive('root', ids.ruh, [
      { variantId: ids.rice, qty: 1 },
      { variantId: ids.rice, qty: 2 },
    ]);
    expect(dup.body.error.details).toEqual([
      expect.objectContaining({ path: 'lines.1.variantId', message: 'validation.duplicate' }),
    ]);
    expect(await StockOperation.countDocuments()).toBe(0);
  });
});

describe('adjust', () => {
  it('applies changes and counts; all-or-nothing when stock is short', async () => {
    await ok(
      await receive('root', ids.ruh, [
        { variantId: ids.red, qty: 10 },
        { variantId: ids.blue, qty: 2 },
      ]),
    );

    const op = await ok(
      await as('clerk').post('/api/v1/inventory/adjust', {
        branchId: ids.ruh,
        reason: 'damaged',
        note: 'Torn in storage',
        lines: [{ variantId: ids.red, delta: -2 }],
      }),
    );
    expect(op).toMatchObject({ docNo: 'ADJ-000001', reason: 'damaged', note: 'Torn in storage' });
    expect(op.movements[0]).toMatchObject({ type: 'adjust', delta: -2, balanceAfter: 8 });

    // Stock count: red counted 6 (−2), blue counted 2 (no change, still recorded), rice 4 (new).
    const count = await ok(
      await as('clerk').post('/api/v1/inventory/adjust', {
        branchId: ids.ruh,
        reason: 'count',
        lines: [
          { variantId: ids.red, counted: '6' },
          { variantId: ids.blue, counted: 2 },
          { variantId: ids.rice, counted: 4 },
        ],
      }),
    );
    const byS = Object.fromEntries(count.movements.map((m) => [m.variant.sku, m]));
    expect(byS['OX-RED']).toMatchObject({ delta: -2, balanceAfter: 6, countedQty: 6 });
    expect(byS['OX-BLUE']).toMatchObject({ delta: 0, balanceAfter: 2, countedQty: 2 });
    expect(byS['RICE-5']).toMatchObject({ delta: 4, balanceAfter: 4, countedQty: 4 });

    const short = await as('clerk').post('/api/v1/inventory/adjust', {
      branchId: ids.ruh,
      reason: 'lost',
      lines: [
        { variantId: ids.red, delta: -1 },
        { variantId: ids.blue, delta: -3 },
      ],
    });
    expect(short.status).toBe(409);
    expect(short.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: [
        { path: 'lines.1.delta', message: 'validation.quantity.insufficient', available: 2 },
      ],
    });
    expect(await onHand(ids.red, ids.ruh)).toBe(6); // first line rolled back too
    expect(await StockOperation.countDocuments({ type: 'adjust' })).toBe(2);
    await expectLedgerConsistent();
  });

  it('validates reason, one of delta/counted, and duplicate lines', async () => {
    const res = await as('clerk').post('/api/v1/inventory/adjust', {
      branchId: ids.ruh,
      reason: 'because',
      lines: [
        { variantId: ids.red, delta: 1, counted: 3 },
        { variantId: ids.blue },
        { variantId: ids.red, delta: 0 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['reason', 'lines.0.delta', 'lines.1.delta', 'lines.2.delta']),
    );
  });
});

describe('transfer', () => {
  it('moves stock between branches in one document; checks stock and scope', async () => {
    await ok(await receive('root', ids.ruh, [{ variantId: ids.rice, qty: 10 }]));
    const op = await ok(
      await as('root').post('/api/v1/inventory/transfer', {
        fromBranchId: ids.ruh,
        toBranchId: ids.jed,
        lines: [{ variantId: ids.rice, qty: 4 }],
      }),
    );
    expect(op).toMatchObject({
      docNo: 'TRF-000001',
      branch: { code: 'RUH' },
      toBranch: { code: 'JED' },
    });
    expect(
      op.movements.map((m) => [m.type, m.branch.code, m.delta, m.balanceAfter]).sort(),
    ).toEqual([
      ['transfer_in', 'JED', 4, 4],
      ['transfer_out', 'RUH', -4, 6],
    ]);

    const tooMuch = await as('root').post('/api/v1/inventory/transfer', {
      fromBranchId: ids.ruh,
      toBranchId: ids.jed,
      lines: [{ variantId: ids.rice, qty: 7 }],
    });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.details[0]).toMatchObject({ path: 'lines.0.qty', available: 6 });
    expect(await onHand(ids.rice, ids.jed)).toBe(4);

    // The clerk works in Riyadh only: can't send to (or take from) Jeddah.
    const scoped = await as('clerk').post('/api/v1/inventory/transfer', {
      fromBranchId: ids.ruh,
      toBranchId: ids.jed,
      lines: [{ variantId: ids.rice, qty: 1 }],
    });
    expect(scoped.status).toBe(403);
    expect(scoped.body.error.code).toBe('BRANCH_SCOPE_DENIED');

    const same = await as('root').post('/api/v1/inventory/transfer', {
      fromBranchId: ids.ruh,
      toBranchId: ids.ruh,
      lines: [{ variantId: ids.rice, qty: 1 }],
    });
    expect(same.status).toBe(400);
    await expectLedgerConsistent();
  });
});

describe('reads and scope', () => {
  beforeEach(async () => {
    await ok(
      await receive('root', ids.ruh, [
        { variantId: ids.red, qty: 3 },
        { variantId: ids.rice, qty: 40 },
      ]),
    );
    await ok(await receive('root', ids.jed, [{ variantId: ids.red, qty: 7 }]));
  });

  it('lists levels in scope with search and low-stock filter', async () => {
    const all = await ok(await as('root').get('/api/v1/inventory/levels?sort=onHand'), 200);
    expect(all.map((l) => [l.branch.code, l.variant.sku, l.onHand])).toEqual([
      ['RUH', 'OX-RED', 3],
      ['JED', 'OX-RED', 7],
      ['RUH', 'RICE-5', 40],
    ]);
    expect(all[0]).toMatchObject({
      threshold: 5,
      lowStockThreshold: null,
      isLow: true,
      isOut: false,
    });

    const picker = await ok(await as('clerk').get('/api/v1/inventory/branches'), 200);
    expect(picker.map((b) => b.code)).toEqual(['RUH']);
    const mine = await ok(await as('clerk').get('/api/v1/inventory/levels'), 200);
    expect(mine.map((l) => l.branch.code)).toEqual(['RUH', 'RUH']);
    expect((await as('clerk').get(`/api/v1/inventory/levels?branchId=${ids.jed}`)).status).toBe(
      403,
    );

    const low = await ok(await as('root').get('/api/v1/inventory/levels?low=true'), 200);
    expect(low.map((l) => l.onHand)).toEqual([3]);
    const bySku = await ok(await as('root').get('/api/v1/inventory/levels?q=ric'), 200);
    expect(bySku.map((l) => l.variant.sku)).toEqual(['RICE-5']);
    const byName = await ok(
      await as('root').get('/api/v1/inventory/levels?q=oxford&branchId=' + ids.jed),
      200,
    );
    expect(byName.map((l) => l.onHand)).toEqual([7]);
    const byBarcode = await ok(
      await as('root').get('/api/v1/inventory/levels?q=6281000000007'),
      200,
    );
    expect(byBarcode).toHaveLength(1);

    const variant = await as('clerk').get(`/api/v1/inventory/variants/${ids.red}/levels`);
    expect(variant.body).toMatchObject({ meta: { total: 3 } });
    const rootVariant = await as('root').get(`/api/v1/inventory/variants/${ids.red}/levels`);
    expect(rootVariant.body.meta.total).toBe(10);
  });

  it('lists movements and operations within scope', async () => {
    const moves = await ok(await as('clerk').get('/api/v1/inventory/movements'), 200);
    expect(moves.every((m) => m.branch.code === 'RUH')).toBe(true);
    expect(moves).toHaveLength(2);

    const ops = await ok(await as('root').get('/api/v1/inventory/operations?type=receive'), 200);
    expect(ops).toHaveLength(2);
    const jedOp = ops.find((o) => o.branch.code === 'JED');
    expect((await as('clerk').get(`/api/v1/inventory/operations/${jedOp.id}`)).status).toBe(404);
    const detail = await ok(await as('root').get(`/api/v1/inventory/operations/${jedOp.id}`), 200);
    expect(detail.movements).toHaveLength(1);
    expect((await ok(await as('clerk').get('/api/v1/inventory/operations'), 200)).length).toBe(1);

    expect((await as('seller').get('/api/v1/inventory/levels')).status).toBe(403);
    expect((await request(app).get('/api/v1/inventory/levels')).status).toBe(401);
  });

  it('per-level thresholds drive low/out alerts', async () => {
    const set = await ok(
      await as('clerk').put('/api/v1/inventory/levels/threshold', {
        branchId: ids.ruh,
        variantId: ids.rice,
        lowStockThreshold: 30,
      }),
      200,
    );
    expect(set).toMatchObject({ onHand: 40, threshold: 30, isLow: false });

    const adjust = (delta) =>
      as('clerk').post('/api/v1/inventory/adjust', {
        branchId: ids.ruh,
        reason: 'correction',
        lines: [{ variantId: ids.rice, delta }],
      });
    await ok(await adjust(-5)); // 35: above the threshold
    await ok(await adjust(-5)); // 30: low
    await ok(await adjust(-1)); // 29: still low, no new alert
    await ok(await adjust(-29)); // 0: out
    await waitFor(() => events.some((e) => e.name === EVENTS.STOCK_OUT));
    expect(events.filter((e) => e.name === EVENTS.STOCK_LOW).map((e) => e.payload)).toEqual([
      expect.objectContaining({
        variantId: ids.rice,
        branchId: ids.ruh,
        onHand: 30,
        threshold: 30,
      }),
    ]);
    expect(events.find((e) => e.name === EVENTS.STOCK_OUT).payload).toMatchObject({ onHand: 0 });

    // Threshold for a variant never stocked in a branch creates an empty level.
    const fresh = await ok(
      await as('root').put('/api/v1/inventory/levels/threshold', {
        branchId: ids.jed,
        variantId: ids.rice,
        lowStockThreshold: null,
      }),
      200,
    );
    expect(fresh).toMatchObject({ onHand: 0, threshold: 5, isOut: true });
  });

  it('keeps branches with stock history from being deleted', async () => {
    const res = await as('root').delete(`/api/v1/branches/${ids.jed}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BRANCH_IN_USE');
  });
});

describe('integrity', () => {
  it('is idempotent with an Idempotency-Key', async () => {
    const body = { branchId: ids.ruh, lines: [{ variantId: ids.rice, qty: 5 }] };
    const first = await as('clerk').post('/api/v1/inventory/receive', body, 'grn-key-00001');
    const second = await as('clerk').post('/api/v1/inventory/receive', body, 'grn-key-00001');
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.movements).toHaveLength(1);
    expect(await onHand(ids.rice, ids.ruh)).toBe(5);

    // Same key, parallel: still booked once.
    const parallel = await Promise.all(
      Array.from({ length: 5 }, () =>
        as('clerk').post('/api/v1/inventory/receive', body, 'grn-key-00002'),
      ),
    );
    expect(new Set(parallel.map((r) => r.body.data.id)).size).toBe(1);
    expect(await onHand(ids.rice, ids.ruh)).toBe(10);

    const otherType = await as('clerk').post(
      '/api/v1/inventory/adjust',
      { branchId: ids.ruh, reason: 'found', lines: [{ variantId: ids.rice, delta: 1 }] },
      'grn-key-00001',
    );
    expect(otherType.status).toBe(409);
    expect((await as('clerk').post('/api/v1/inventory/receive', body, 'bad key!')).status).toBe(
      400,
    );
  });

  it('never oversells under concurrent decreases and serializes concurrent increases', async () => {
    // 15 parallel first receipts of a variant with no level yet: one level, balances 1..15.
    await Promise.all(
      Array.from({ length: 15 }, () => receive('root', ids.ruh, [{ variantId: ids.blue, qty: 1 }])),
    ).then((rs) => rs.forEach((r) => expect(r.status).toBe(201)));
    expect(await StockLevel.countDocuments({ variantId: ids.blue })).toBe(1);
    const balances = (await StockMovement.find({ variantId: ids.blue }).lean()).map(
      (m) => m.balanceAfter,
    );
    expect(balances.sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));

    // 25 parallel sales of 1 against 15 on hand: exactly 15 succeed.
    const sell = async () => {
      try {
        const result = await withTransaction((session) =>
          applyStockOperation(
            { type: 'sale', branchId: ids.ruh, lines: [{ variantId: ids.blue, qty: 1 }] },
            { session },
          ),
        );
        publishStockResult(result);
        return 'sold';
      } catch (err) {
        if (err.code === 'INSUFFICIENT_STOCK') return 'short';
        throw err;
      }
    };
    const outcomes = await Promise.all(Array.from({ length: 25 }, sell));
    expect(outcomes.filter((o) => o === 'sold')).toHaveLength(15);
    expect(await onHand(ids.blue, ids.ruh)).toBe(0);
    expect(await StockMovement.countDocuments({ variantId: ids.blue, type: 'sale' })).toBe(15);
    expect(await StockOperation.countDocuments({ type: 'sale', docNo: null })).toBe(15);
    await expectLedgerConsistent();
  }, 60_000);

  it('keeps the ledger append-only', async () => {
    await ok(await receive('root', ids.ruh, [{ variantId: ids.rice, qty: 1 }]));
    await expect(StockMovement.updateOne({}, { $set: { delta: 100 } })).rejects.toThrow(
      /append-only/,
    );
    await expect(StockMovement.deleteMany({})).rejects.toThrow(/append-only/);
    expect(await StockMovement.countDocuments()).toBe(1);
  });
});
