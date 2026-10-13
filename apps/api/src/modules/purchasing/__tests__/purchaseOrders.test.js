import { EVENTS, PERMISSIONS as P } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../../../test/http.js';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
let app;
const tokens = {};
const ids = {};
const events = [];
let off;

const as = (who) => {
  const auth = (r) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body = {}, key) => {
      const r = auth(request(app).post(url));
      return (key ? r.set('Idempotency-Key', key) : r).send(body);
    },
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};
const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const login = async (who) => {
  const res = await request(app)
    .post('/api/v1/auth/staff/login')
    .send({ email: `${who}@shop.test`, password: PW });
  tokens[who] = res.body.data.accessToken;
};
const PO = '/api/v1/purchase-orders';
const draft = (who = 'buyer', body = {}) =>
  as(who).post(PO, {
    supplierId: ids.supplier,
    branchId: ids.ruh,
    expectedAt: '2026-11-01',
    reference: 'Q-1001',
    lines: [
      { variantId: ids.red, qty: 10, unitCost: 5000 },
      { variantId: ids.rice, qty: 20, unitCost: 1200 },
    ],
    ...body,
  });
const orderedPo = async () => {
  const po = await ok(await draft(), 201);
  return ok(await as('buyer').post(`${PO}/${po.id}/order`));
};
const level = async (variantId, branchId = ids.ruh) =>
  (await as('root').get(`/api/v1/inventory/levels?variantId=${variantId}&branchId=${branchId}`))
    .body.data[0]?.onHand ?? 0;
const variantCost = async (productId, variantId) =>
  (await ok(await as('root').get(`/api/v1/products/${productId}`))).variants.find(
    (v) => v.id === variantId,
  ).cost;
const setCostMethod = (value) =>
  as('root').patch('/api/v1/settings', { changes: [{ key: 'purchase.costMethod', value }] });

beforeAll(() => {
  off = eventBus.on(EVENTS.PRODUCT_COST_CHANGED, (e) => events.push(e));
});
afterAll(() => off());

beforeEach(async () => {
  events.length = 0;
  setTranslationScheduler(async () => {});
  await loadSettings();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  await login('root');

  const branch = async (code) =>
    (await ok(await as('root').post('/api/v1/branches', { code, name: code }), 201)).id;
  ids.ruh = await branch('RUH');
  ids.jed = await branch('JED');
  ids.supplier = (
    await ok(await as('root').post('/api/v1/suppliers', { name: 'Gulf Trading' }), 201)
  ).id;
  ids.inactive = (
    await ok(await as('root').post('/api/v1/suppliers', { name: 'Old Co', isActive: false }), 201)
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
    201,
  );
  ids.shirt = shirt.id;
  ids.red = shirt.variants.find((v) => v.sku === 'OX-RED').id;
  ids.blue = shirt.variants.find((v) => v.sku === 'OX-BLUE').id;
  const rice = await ok(
    await as('root').post('/api/v1/products', {
      name: 'Basmati Rice',
      variants: [{ sku: 'RICE-5', price: 3450 }],
    }),
    201,
  );
  ids.riceProduct = rice.id;
  ids.rice = rice.variants[0].id;

  const roles = {
    buyer: [P.PURCHASE_VIEW, P.PURCHASE_MANAGE, P.INVENTORY_RECEIVE, P.INVENTORY_VIEW],
    viewer: [P.PURCHASE_VIEW],
  };
  for (const [who, permissions] of Object.entries(roles)) {
    const role = await ok(
      await as('root').post('/api/v1/roles', {
        name: `Role ${who}`,
        permissions,
        allBranches: false,
      }),
      201,
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

describe('drafting and ordering', () => {
  it('creates a numbered draft with totals and a supplier snapshot', async () => {
    const po = await ok(await draft(), 201);
    expect(po).toMatchObject({
      poNo: 'PO-000001',
      status: 'draft',
      supplier: { id: ids.supplier, name: 'Gulf Trading' },
      branch: { code: 'RUH' },
      expectedAt: '2026-11-01',
      reference: 'Q-1001',
      totals: { ordered: 74_000, received: 0, units: 30, unitsReceived: 0 },
    });
    expect(po.lines[0]).toMatchObject({
      variant: { sku: 'OX-RED' },
      qtyOrdered: 10,
      qtyReceived: 0,
      unitCost: 5000,
      total: 50_000,
    });
    expect(po.lines[0].variant).not.toHaveProperty('cost'); // product cost needs product.viewCost
    expect((await ok(await draft(), 201)).poNo).toBe('PO-000002');

    // The snapshot survives a supplier rename.
    await as('root').patch(`/api/v1/suppliers/${ids.supplier}`, { name: 'Gulf Trading LLC' });
    expect((await ok(await as('buyer').get(`${PO}/${po.id}`))).supplier.name).toBe('Gulf Trading');
  });

  it('validates supplier, branch, variants and scope', async () => {
    const res = await draft('buyer', { supplierId: ids.inactive });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('supplierId');

    await as('root').delete(`/api/v1/products/${ids.riceProduct}`);
    const gone = await draft();
    expect(gone.status).toBe(400);
    expect(gone.body.error.details).toEqual([
      expect.objectContaining({ path: 'lines.1.variantId' }),
    ]);

    expect((await draft('buyer', { branchId: ids.jed, lines: [] })).status).toBe(403);
    expect((await draft('viewer', { lines: [] })).status).toBe(403);
    const bad = await draft('buyer', {
      lines: [
        { variantId: ids.red, qty: 1, unitCost: -1 },
        { variantId: ids.red, qty: 1.5, unitCost: 1 },
      ],
    });
    expect(bad.body.error.details.map((d) => d.path)).toEqual(['lines.0.unitCost', 'lines.1.qty']);
  });

  it('edits drafts, then orders; empty drafts cannot be ordered', async () => {
    const empty = await ok(await draft('buyer', { lines: [] }), 201);
    const res = await as('buyer').post(`${PO}/${empty.id}/order`);
    expect(res.status).toBe(400);

    const po = await ok(
      await as('buyer').patch(`${PO}/${empty.id}`, {
        lines: [{ variantId: ids.blue, qty: 4, unitCost: 3000 }],
        expectedAt: null,
        note: 'Urgent',
      }),
    );
    expect(po).toMatchObject({ expectedAt: null, note: 'Urgent', totals: { ordered: 12_000 } });
    const ordered = await ok(await as('buyer').post(`${PO}/${po.id}/order`));
    expect(ordered.status).toBe('ordered');
    expect(ordered.orderedAt).toBeTruthy();
    // Supplier is fixed once ordered.
    const change = await as('buyer').patch(`${PO}/${po.id}`, { supplierId: ids.supplier });
    expect(change.status).toBe(200); // same supplier → no change
    const other = (
      await ok(await as('root').post('/api/v1/suppliers', { name: 'Other Supplier' }), 201)
    ).id;
    const moved = await as('buyer').patch(`${PO}/${po.id}`, { supplierId: other });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('receiving', () => {
  it('books stock through the ledger, partially then fully', async () => {
    const po = await orderedPo();
    const first = await ok(
      await as('buyer').post(`${PO}/${po.id}/receive`, {
        lines: [{ variantId: ids.red, qty: 4 }],
        reference: 'DN-55',
      }),
    );
    expect(first).toMatchObject({
      status: 'partially_received',
      totals: { received: 20_000, unitsReceived: 4 },
    });
    expect(first.receipts).toEqual([
      expect.objectContaining({ docNo: 'GRN-000001', reference: 'DN-55', units: 4, value: 20_000 }),
    ]);
    expect(await level(ids.red)).toBe(4);

    const op = await ok(
      await as('root').get(`/api/v1/inventory/operations/${first.receipts[0].operationId}`),
    );
    expect(op).toMatchObject({
      type: 'receive',
      refType: 'purchaseOrder',
      refId: po.id,
      reference: 'DN-55',
      supplierId: ids.supplier,
    });
    expect(op.movements[0]).toMatchObject({ delta: 4, unitCost: 5000 });

    const over = await as('buyer').post(`${PO}/${po.id}/receive`, {
      lines: [{ variantId: ids.red, qty: 7 }],
    });
    expect(over.status).toBe(400);
    expect(over.body.error.details[0]).toMatchObject({ path: 'lines.0.qty', remaining: 6 });
    const stranger = await as('buyer').post(`${PO}/${po.id}/receive`, {
      lines: [{ variantId: ids.blue, qty: 1 }],
    });
    expect(stranger.body.error.details[0].path).toBe('lines.0.variantId');

    const rest = await ok(
      await as('buyer').post(`${PO}/${po.id}/receive`, {
        lines: [
          { variantId: ids.red, qty: 6 },
          { variantId: ids.rice, qty: 20 },
        ],
      }),
    );
    expect(rest.status).toBe('received');
    expect(rest.receipts).toHaveLength(2);
    expect(await level(ids.rice)).toBe(20);
    const again = await as('buyer').post(`${PO}/${po.id}/receive`, {
      lines: [{ variantId: ids.rice, qty: 1 }],
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');

    const audit = await waitFor(async () => {
      const res = await as('root').get('/api/v1/audit?action=purchaseOrder.received');
      return res.body.data.length === 2 ? res.body.data : null;
    });
    expect(audit[1].data).toMatchObject({ poNo: 'PO-000001', docNo: 'GRN-000001' });
  });

  it('cannot receive drafts; needs inventory.receive', async () => {
    const po = await ok(await draft(), 201);
    const res = await as('buyer').post(`${PO}/${po.id}/receive`, {
      lines: [{ variantId: ids.red, qty: 1 }],
    });
    expect(res.status).toBe(409);
    await as('buyer').post(`${PO}/${po.id}/order`);
    const viewer = await as('viewer').post(`${PO}/${po.id}/receive`, {
      lines: [{ variantId: ids.red, qty: 1 }],
    });
    expect(viewer.status).toBe(403);
  });

  it('updates variant costs by the configured method', async () => {
    // 10 already in stock at the current cost of 40.00
    await ok(
      await as('root').post('/api/v1/inventory/receive', {
        branchId: ids.jed,
        lines: [{ variantId: ids.red, qty: 10 }],
      }),
      201,
    );
    const po = await orderedPo();
    await ok(
      await as('buyer').post(`${PO}/${po.id}/receive`, {
        lines: [{ variantId: ids.red, qty: 10 }],
      }),
    );
    expect(await variantCost(ids.shirt, ids.red)).toBe(4500); // (10×4000 + 10×5000) / 20
    await waitFor(() => events.length >= 1);
    expect(events[0].payload).toMatchObject({
      variantId: ids.red,
      before: 4000,
      after: 4500,
      source: 'purchaseOrder',
    });

    // Rice had no cost yet → the received cost.
    await ok(await setCostMethod('last'));
    await ok(
      await as('buyer').post(`${PO}/${po.id}/receive`, {
        lines: [{ variantId: ids.rice, qty: 5 }],
      }),
    );
    expect(await variantCost(ids.riceProduct, ids.rice)).toBe(1200);

    await ok(await setCostMethod('none'));
    const po2 = await ok(
      await draft('buyer', { lines: [{ variantId: ids.red, qty: 2, unitCost: 9000 }] }),
      201,
    );
    await as('buyer').post(`${PO}/${po2.id}/order`);
    await ok(
      await as('buyer').post(`${PO}/${po2.id}/receive`, {
        lines: [{ variantId: ids.red, qty: 2 }],
      }),
    );
    expect(await variantCost(ids.shirt, ids.red)).toBe(4500);
  });

  it('is idempotent and never over-receives under concurrency', async () => {
    const po = await orderedPo();
    const body = { lines: [{ variantId: ids.red, qty: 3 }] };
    const first = await as('buyer').post(`${PO}/${po.id}/receive`, body, 'delivery-0001');
    const parallel = await Promise.all(
      Array.from({ length: 4 }, () =>
        as('buyer').post(`${PO}/${po.id}/receive`, body, 'delivery-0001'),
      ),
    );
    expect(first.status).toBe(200);
    parallel.forEach((r) => expect(r.headers['idempotent-replayed']).toBe('true'));
    expect(await level(ids.red)).toBe(3);

    const other = await orderedPo();
    const misuse = await as('buyer').post(`${PO}/${other.id}/receive`, body, 'delivery-0001');
    expect(misuse.status).toBe(409);
    expect(misuse.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

    // Two clerks receive the remaining 7 at the same time: only one booking.
    const rest = { lines: [{ variantId: ids.red, qty: 7 }] };
    const results = await Promise.all([
      as('buyer').post(`${PO}/${po.id}/receive`, rest),
      as('root').post(`${PO}/${po.id}/receive`, rest),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await level(ids.red)).toBe(10);
    const final = await ok(await as('root').get(`${PO}/${po.id}`));
    expect(final.lines[0].qtyReceived).toBe(10);
  });
});

describe('changes after receipts, close and cancel', () => {
  it('protects received lines and recomputes the status', async () => {
    const po = await orderedPo();
    await ok(
      await as('buyer').post(`${PO}/${po.id}/receive`, { lines: [{ variantId: ids.red, qty: 4 }] }),
    );
    const res = await as('buyer').patch(`${PO}/${po.id}`, {
      lines: [{ variantId: ids.red, qty: 3, unitCost: 5500 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['lines.0.qty', 'lines.0.unitCost']),
    );
    const dropped = await as('buyer').patch(`${PO}/${po.id}`, {
      lines: [{ variantId: ids.rice, qty: 20, unitCost: 1200 }],
    });
    expect(dropped.body.error.details[0]).toMatchObject({ path: 'lines', variantId: ids.red });
    expect((await as('buyer').patch(`${PO}/${po.id}`, { branchId: ids.ruh })).status).toBe(200);

    // Ordering only what already arrived completes the order.
    const done = await ok(
      await as('buyer').patch(`${PO}/${po.id}`, {
        lines: [{ variantId: ids.red, qty: 4, unitCost: 5000 }],
      }),
    );
    expect(done.status).toBe('received');
  });

  it('closes partially received orders and cancels untouched ones', async () => {
    const po = await orderedPo();
    expect((await as('buyer').post(`${PO}/${po.id}/close`)).status).toBe(409);
    await ok(
      await as('buyer').post(`${PO}/${po.id}/receive`, { lines: [{ variantId: ids.red, qty: 1 }] }),
    );
    expect((await as('buyer').post(`${PO}/${po.id}/cancel`)).status).toBe(409);
    const closed = await ok(
      await as('buyer').post(`${PO}/${po.id}/close`, { note: 'Supplier out of stock' }),
    );
    expect(closed).toMatchObject({ status: 'closed', note: 'Supplier out of stock' });
    expect((await as('buyer').patch(`${PO}/${po.id}`, { note: 'x' })).status).toBe(409);

    const other = await orderedPo();
    expect((await ok(await as('buyer').post(`${PO}/${other.id}/cancel`))).status).toBe('cancelled');
  });
});

describe('lists, scope and references', () => {
  it('lists within scope with filters; out-of-scope orders are hidden', async () => {
    const mine = await ok(await draft(), 201);
    const theirs = await ok(await draft('root', { branchId: ids.jed, reference: 'JED-77' }), 201);
    await as('buyer').post(`${PO}/${mine.id}/order`);

    const list = await as('viewer').get(PO);
    expect(list.body.data.map((p) => p.poNo)).toEqual(['PO-000001']);
    expect(list.body.data[0]).not.toHaveProperty('lines');
    expect((await as('viewer').get(`${PO}/${theirs.id}`)).status).toBe(404);

    const all = await ok(await as('root').get(`${PO}?status=draft`));
    expect(all.map((p) => p.poNo)).toEqual(['PO-000002']);
    expect((await ok(await as('root').get(`${PO}?q=jed-7`))).map((p) => p.id)).toEqual([theirs.id]);
    expect((await ok(await as('root').get(`${PO}?q=gulf&sort=poNo`))).map((p) => p.poNo)).toEqual([
      'PO-000001',
      'PO-000002',
    ]);
  });

  it('keeps suppliers and branches with purchase orders from being deleted', async () => {
    await ok(await draft('root', { branchId: ids.jed, lines: [] }), 201);
    const supplier = await as('root').delete(`/api/v1/suppliers/${ids.supplier}`);
    expect(supplier.body.error.code).toBe('SUPPLIER_IN_USE');
    const branch = await as('root').delete(`/api/v1/branches/${ids.jed}`);
    expect(branch.body.error.code).toBe('BRANCH_IN_USE');
  });

  it('variant picker searches SKU/name; cost needs product.viewCost', async () => {
    const res = await ok(await as('root').get('/api/v1/products/variants?q=ox'));
    expect(res.map((v) => v.sku)).toEqual(['OX-BLUE', 'OX-RED']);
    expect(res[1]).toMatchObject({ cost: 4000, options: [{ value: { en: 'Red' } }] });
    const buyer = await ok(await as('buyer').get('/api/v1/products/variants?q=rice'));
    expect(buyer).toEqual([expect.not.objectContaining({ cost: expect.anything() })]);
    expect((await as('buyer').get('/api/v1/products/variants')).status).toBe(400);
  });
});
