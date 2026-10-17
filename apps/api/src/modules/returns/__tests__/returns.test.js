import { ERROR_CODES, EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { registerCustomer } from '../../customers/index.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { getOnHand } from '../../inventory/index.js';
import { Order } from '../../orders/order.model.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { ReturnExchange } from '../return.model.js';

/**
 * P6.6 — Returns & exchanges: return to stock/damaged, refund method, exchange rule
 * (new value >= old; customer pays difference), new receipt print, ledger + loyalty reversal.
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
  await Promise.all([Order.init(), ReturnExchange.init()]);
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

  const cashierRoleId = await findSystemRoleId('cashier');
  await createStaff(null, {
    name: 'Cara Cashier',
    email: 'cara@shop.test',
    password: PW,
    roleId: cashierRoleId,
    branchIds: [ids.shop],
  });
  tokens.cara = await login('cara@shop.test');

  const coffee = await ok(
    await as('root').post('/api/v1/products', {
      name: 'Coffee Beans',
      status: 'active',
      variants: [{ sku: 'COF-1', optionValues: {}, price: 11_500 }],
    }),
    201,
  );
  const kettle = await ok(
    await as('root').post('/api/v1/products', {
      name: 'Pour-Over Kettle',
      status: 'active',
      variants: [{ sku: 'KET-1', optionValues: {}, price: 17_250 }],
    }),
    201,
  );
  const filter = await ok(
    await as('root').post('/api/v1/products', {
      name: 'Paper Filters',
      status: 'active',
      variants: [{ sku: 'FLT-1', optionValues: {}, price: 5_750 }],
    }),
    201,
  );
  ids.coffee = coffee.variants[0].id;
  ids.kettle = kettle.variants[0].id;
  ids.filter = filter.variants[0].id;

  await ok(
    await as('root').post('/api/v1/inventory/receive', {
      branchId: ids.shop,
      lines: [
        { variantId: ids.coffee, qty: 20, unitCost: 5000 },
        { variantId: ids.kettle, qty: 10, unitCost: 8000 },
        { variantId: ids.filter, qty: 30, unitCost: 2000 },
      ],
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
      isDefault: true,
    }),
    201,
  );
});

const getStockQty = async (variantId) => {
  const onHand = await getOnHand(ids.shop, [variantId]);
  return onHand.get(String(variantId)) ?? 0;
};

describe('P6.6 — Returns & exchanges', () => {
  it('processes partial restock return, damaged write-off return, idempotency replay, and loyalty reversal', async () => {
    await registerCustomer({
      name: 'Layla Customer',
      email: 'layla@customer.test',
      phone: '+966501112233',
      password: 'CustPassword123!',
    });

    // Sell 3 bags of coffee (3 x 11,500 = 34,500 halalas) to Layla
    const sale = await ok(
      await as('cara').post('/api/v1/pos/sales', {
        branchId: ids.shop,
        customer: { mode: 'contact', phone: '+966501112233' },
        items: [{ variantId: ids.coffee, qty: 3 }],
        payments: [{ method: 'cash', amount: 34_500 }],
      }),
      201,
    );
    expect(await getStockQty(ids.coffee)).toBe(17);

    // 1. Lookup order by orderNo
    const lookup = await ok(await as('cara').get(`/api/v1/returns/lookup-order?q=${sale.orderNo}`));
    expect(lookup.order.orderNo).toBe(sale.orderNo);
    expect(lookup.returnable).toBe(true);
    expect(lookup.items[0].returnableQty).toBe(3);

    // 2. Quote returning 1 restock + 1 damaged
    const quote = await ok(
      await as('cara').post('/api/v1/returns/quote', {
        type: 'return',
        orderId: sale.id,
        returnLines: [
          { variantId: ids.coffee, qty: 1, disposition: 'restock' },
          { variantId: ids.coffee, qty: 1, disposition: 'damaged' },
        ],
      }),
    );
    expect(quote.refundAmount).toBe(23_000);
    expect(quote.fullyReturned).toBe(false);

    const loyaltyEvents = [];
    const offLoyalty = eventBus.on(EVENTS.LOYALTY_REVERSED, (p) => loyaltyEvents.push(p));

    // 3. Execute partial return (1 restock + 1 damaged) with Idempotency-Key
    const firstReturnRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${tokens.cara}`)
      .set('Idempotency-Key', 'idem-ret-1')
      .send({
        type: 'return',
        orderId: sale.id,
        returnLines: [
          { variantId: ids.coffee, qty: 1, disposition: 'restock' },
          { variantId: ids.coffee, qty: 1, disposition: 'damaged' },
        ],
        refundMethod: 'cash',
        reason: '1 unopened, 1 torn bag',
      });
    const firstReturn = await ok(firstReturnRes, 201);
    expect(firstReturn.returnNo).toMatch(/^RET-\d{6}$/);
    expect(firstReturn.refundAmount).toBe(23_000);
    expect(firstReturn.refundMethod).toBe('cash');
    expect(firstReturn.receiptLines.join('\n')).toContain('RETURN / CREDIT NOTE');

    // Replay with the same Idempotency-Key returns 200 and does not double-process
    const replayRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${tokens.cara}`)
      .set('Idempotency-Key', 'idem-ret-1')
      .send({
        type: 'return',
        orderId: sale.id,
        returnLines: [
          { variantId: ids.coffee, qty: 1, disposition: 'restock' },
          { variantId: ids.coffee, qty: 1, disposition: 'damaged' },
        ],
        refundMethod: 'cash',
      });
    expect(replayRes.status).toBe(200);
    expect(replayRes.body.data.id).toBe(firstReturn.id);

    // Stock check: 17 on hand -> +1 restock -> +1 damaged return -1 damaged write-off = 18 sellable
    expect(await getStockQty(ids.coffee)).toBe(18);
    expect(firstReturn.stockOperations.map((op) => op.type).sort()).toEqual([
      'adjust',
      'return',
      'return',
    ]);
    const ledger = await ok(
      await as('root').get(
        `/api/v1/inventory/movements?branchId=${ids.shop}&variantId=${ids.coffee}`,
      ),
    );
    expect(
      ledger.some((e) => e.type === 'adjust' && e.reason === 'damaged' && e.delta === -1),
    ).toBe(true);

    // Loyalty reversal event emitted for the customer
    expect(loyaltyEvents).toHaveLength(1);
    expect(loyaltyEvents[0].payload).toMatchObject({
      returnNo: firstReturn.returnNo,
      orderNo: sale.orderNo,
      amount: 23_000,
    });
    offLoyalty();

    // Order is now `partially_returned` with 1 remaining returnable unit
    const lookupAfter = await ok(
      await as('cara').get(`/api/v1/returns/lookup-order?q=${sale.orderNo}`),
    );
    expect(lookupAfter.order.status).toBe('partially_returned');
    expect(lookupAfter.items[0].returnableQty).toBe(1);

    // Attempting to return 2 more fails with 409 RETURN_QTY_EXCEEDED
    const tooMany = await as('cara').post('/api/v1/returns', {
      type: 'return',
      orderId: sale.id,
      returnLines: [{ variantId: ids.coffee, qty: 2, disposition: 'restock' }],
      refundMethod: 'cash',
    });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.code).toBe(ERROR_CODES.RETURN_QTY_EXCEEDED);

    // Return the final 1 unit -> order transitions to `refunded`
    const finalReturn = await ok(
      await as('cara').post('/api/v1/returns', {
        type: 'return',
        orderId: sale.id,
        returnLines: [{ variantId: ids.coffee, qty: 1, disposition: 'restock' }],
        refundMethod: 'original',
      }),
      201,
    );
    expect(finalReturn.refundAmount).toBe(11_500);
    const finalLookup = await ok(
      await as('cara').get(`/api/v1/returns/lookup-order?q=${sale.orderNo}`),
    );
    expect(finalLookup.order.status).toBe('refunded');
    expect(finalLookup.returnable).toBe(false);
  });

  it('enforces the exchange rule (new >= returned credit), collects difference, moves stock, and prints receipt', async () => {
    // Sell 1 bag of coffee (11,500 halalas)
    const sale = await ok(
      await as('cara').post('/api/v1/pos/sales', {
        branchId: ids.shop,
        items: [{ variantId: ids.coffee, qty: 1 }],
        payments: [{ method: 'cash', amount: 11_500 }],
      }),
      201,
    );
    expect(await getStockQty(ids.coffee)).toBe(19);
    expect(await getStockQty(ids.kettle)).toBe(10);

    // 1. Attempting to exchange Coffee (11,500) for Paper Filters (5,750) fails with 409 EXCHANGE_VALUE_TOO_LOW
    const lowExchange = await as('cara').post('/api/v1/returns', {
      type: 'exchange',
      orderId: sale.id,
      returnLines: [{ variantId: ids.coffee, qty: 1, disposition: 'restock' }],
      exchangeItems: [{ variantId: ids.filter, qty: 1 }],
      payments: [],
    });
    expect(lowExchange.status).toBe(409);
    expect(lowExchange.body.error.code).toBe(ERROR_CODES.EXCHANGE_VALUE_TOO_LOW);

    // 2. Exchanging Coffee (11,500) for Pour-Over Kettle (17,250) requires 5,750 difference payment
    const unpaidDiff = await as('cara').post('/api/v1/returns', {
      type: 'exchange',
      orderId: sale.id,
      returnLines: [{ variantId: ids.coffee, qty: 1, disposition: 'restock' }],
      exchangeItems: [{ variantId: ids.kettle, qty: 1 }],
      payments: [{ method: 'cash', amount: 2_000 }],
    });
    expect(unpaidDiff.status).toBe(409);

    // 3. Pay full difference (6,000 cash tendered -> 250 change given)
    const exchange = await ok(
      await as('cara').post('/api/v1/returns', {
        type: 'exchange',
        orderId: sale.id,
        returnLines: [{ variantId: ids.coffee, qty: 1, disposition: 'restock' }],
        exchangeItems: [{ variantId: ids.kettle, qty: 1 }],
        payments: [{ method: 'cash', amount: 6_000 }],
        reason: 'Upgraded to kettle',
      }),
      201,
    );
    expect(exchange.returnNo).toMatch(/^EXC-\d{6}$/);
    expect(exchange.returnTotals.total).toBe(11_500);
    expect(exchange.exchangeTotals.total).toBe(17_250);
    expect(exchange.differenceDue).toBe(5_750);
    expect(exchange.changeGiven).toBe(250);

    // Stock updated: coffee restocked to 20, kettle sold down to 9
    expect(await getStockQty(ids.coffee)).toBe(20);
    expect(await getStockQty(ids.kettle)).toBe(9);

    // Print receipt job builds ESC/POS payload
    const printJob = await ok(await as('cara').post(`/api/v1/returns/${exchange.id}/print`, {}));
    expect(printJob.printer).toBe('EPSON-TM-T20');
    expect(printJob.lines.join('\n')).toContain('EXCHANGE RECEIPT');
    expect(printJob.lines.join('\n')).toContain(exchange.returnNo);

    // List and getOne endpoints
    const list = await ok(await as('cara').get(`/api/v1/returns?type=exchange`));
    expect(list).toHaveLength(1);
    expect(list[0].returnNo).toBe(exchange.returnNo);

    const detail = await ok(await as('cara').get(`/api/v1/returns/${exchange.id}`));
    expect(detail.id).toBe(exchange.id);
  });
});
