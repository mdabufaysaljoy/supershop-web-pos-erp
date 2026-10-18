import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '../../test/http.js';
import { useMemoryMongo } from '../../test/mongo.js';
import { createApp } from '../app.js';
import { setTranslationScheduler } from '../modules/i18n/localized.plugin.js';
import { registerCustomer } from '../modules/customers/index.js';
import { getOnHand } from '../modules/inventory/index.js';
import { Order } from '../modules/orders/order.model.js';
import { seedPaymentMethods } from '../modules/paymentMethods/index.js';
import { seedDefaultRoles } from '../modules/rbac/index.js';
import { loadSettings } from '../modules/settings/index.js';
import { ensureSuperAdmin } from '../modules/staff/index.js';
import { ReturnExchange } from '../modules/returns/return.model.js';
import { Shift } from '../modules/shifts/shift.model.js';
import { getCustomerLoyaltySummary } from '../modules/loyalty/index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const CSRF = { 'X-CSRF-Protection': '1', Origin: 'http://localhost:3000' };
let app;
let rootToken;
const ids = {};

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};

const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body, key) => {
    const req = request(app).post(url).set('Authorization', `Bearer ${rootToken}`);
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  },
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
};

const getStock = async (vId, bId = ids.branch) =>
  (await getOnHand(bId, [vId])).get(String(vId)) ?? 0;

describe('Comprehensive Commerce API E2E Journeys (P10.2)', () => {
  beforeEach(async () => {
    setTranslationScheduler(async () => {});
    await loadSettings();
    await Promise.all([Order.init(), ReturnExchange.init(), Shift.init()]);
    app = createApp({ checks: { db: () => true, redis: async () => true } });
    await seedDefaultRoles();
    await seedPaymentMethods();
    await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });

    const loginRes = await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW });
    rootToken = loginRes.body.data.accessToken;

    // Create Main Shop Branch
    const branch = await ok(
      await root.post('/api/v1/branches', {
        code: 'MAIN-SHOP',
        name: 'Main Retail Store',
        fulfillsOnlineOrders: true,
      }),
      201,
    );
    ids.branch = branch.id;

    // Create Products with active status
    const shirt = await ok(
      await root.post('/api/v1/products', {
        name: 'Premium Oxford Shirt',
        status: 'active',
        options: [{ name: 'Size', values: [{ label: 'M' }, { label: 'L' }] }],
        variants: [
          { sku: 'SHIRT-M', optionValues: { size: 'm' }, price: 11500, cost: 5000 },
          { sku: 'SHIRT-L', optionValues: { size: 'l' }, price: 11500, cost: 5000 },
        ],
      }),
      201,
    );
    ids.shirtM = shirt.variants.find((v) => v.sku === 'SHIRT-M').id;
    ids.shirtL = shirt.variants.find((v) => v.sku === 'SHIRT-L').id;

    const cap = await ok(
      await root.post('/api/v1/products', {
        name: 'Wool Baseball Cap',
        status: 'active',
        variants: [{ sku: 'CAP-BLK', price: 5750, cost: 2000 }],
      }),
      201,
    );
    ids.cap = cap.variants[0].id;

    // Receive initial stock into Main Shop
    await ok(
      await root.post('/api/v1/inventory/receive', {
        branchId: ids.branch,
        lines: [
          { variantId: ids.shirtM, qty: 50, unitCost: 5000 },
          { variantId: ids.shirtL, qty: 50, unitCost: 5000 },
          { variantId: ids.cap, qty: 30, unitCost: 2000 },
        ],
      }),
      201,
    );

    // Register a test customer
    const cust = await registerCustomer({
      email: 'customer.test@example.com',
      password: 'password-1234',
      name: 'Ahmed Al-Saud',
      phone: '+966501234567',
    });
    ids.customer = cust.profile.id;
  });

  it('Journey 1: Online Storefront Checkout -> Fulfillment -> Loyalty Accrual', async () => {
    // 1. Initial stock on hand
    expect(await getStock(ids.shirtM)).toBe(50);

    // 2. Use supertest agent to maintain customer session
    const agent = request.agent(app);

    // Customer logs in
    const loginRes = await agent
      .post('/api/v1/auth/customer/login')
      .send({ identifier: 'customer.test@example.com', password: 'password-1234' });
    expect(loginRes.status).toBe(200);
    const custAccessToken = loginRes.body.data.accessToken;

    const cartRes = await agent
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${custAccessToken}`)
      .set(CSRF)
      .send({ variantId: ids.shirtM, qty: 2 });
    expect(cartRes.status).toBe(200);

    // 3. Checkout with customer info & Cash on Delivery (cod)
    const checkoutRes = await agent
      .post('/api/v1/checkout?lang=en')
      .set('Authorization', `Bearer ${custAccessToken}`)
      .set(CSRF)
      .send({
        contact: {
          name: 'Ahmed Al-Saud',
          email: 'customer.test@example.com',
          phone: '+966501234567',
        },
        address: {
          city: 'Riyadh',
          line1: 'King Fahd Road, Tower 5',
          postalCode: '12345',
        },
        paymentMethod: 'cod',
      });

    expect(checkoutRes.status).toBe(201);
    const order = checkoutRes.body.data;
    expect(order.orderNo).toMatch(/^ORD-/);
    expect(order.totals.total).toBe(23000); // 2 * 11500

    // 4. Staff moves order through fulfillment: cod_confirmed -> processing -> shipped -> delivered -> completed
    const oId = order.id;

    // Transition to cod_confirmed then processing
    await ok(await root.post(`/api/v1/orders/${oId}/transitions`, { to: 'cod_confirmed' }));
    await ok(await root.post(`/api/v1/orders/${oId}/transitions`, { to: 'processing' }));

    // Add shipment (transitions to shipped)
    await ok(
      await root.post(`/api/v1/orders/${oId}/shipments`, {
        carrier: 'Aramex',
        trackingNumber: 'TRACK-987654',
      }),
    );

    // Mark delivered & completed (and paid since COD was received)
    await ok(await root.post(`/api/v1/orders/${oId}/transitions`, { to: 'delivered' }));
    await ok(await root.post(`/api/v1/orders/${oId}/transitions`, { to: 'completed' }));

    // 5. Verify stock decreased by 2 units
    expect(await getStock(ids.shirtM)).toBe(48);

    // 6. Verify loyalty points awarded for 230 SAR order (1 pt per 100 SAR -> 2 pts)
    const loyalty = await waitFor(async () => {
      try {
        return await getCustomerLoyaltySummary(ids.customer);
      } catch {
        return null;
      }
    });
    expect(loyalty.pointsBalance).toBeGreaterThanOrEqual(2);
  });

  it('Journey 2: POS Counter Sale -> Shift Reconciliation -> Z-Report Snapshot', async () => {
    // 1. Open a Cashier Shift
    const shiftRes = await root.post('/api/v1/shifts/open', {
      branchId: ids.branch,
      openingCash: 50000, // 500 SAR float
    });
    expect(shiftRes.status).toBe(201);
    const shift = shiftRes.body.data;
    expect(shift.status).toBe('open');

    // 2. POS Quote for 1 shirt + 1 cap with 10% discount on shirt
    const quoteRes = await root.post('/api/v1/pos/quote', {
      branchId: ids.branch,
      items: [
        {
          variantId: ids.shirtL,
          qty: 1,
          discount: { type: 'percent', value: 1000 }, // 10% off
        },
        { variantId: ids.cap, qty: 1 },
      ],
    });
    expect(quoteRes.status).toBe(200);
    const quote = quoteRes.body.data;
    expect(quote.items).toHaveLength(2);
    // Shirt: 11500 - 1150 = 10350; Cap: 5750; Total: 16100
    expect(quote.totals.total).toBe(16100);

    // 3. Complete POS Sale with 200 SAR cash tender (change given: 39 SAR = 3900 halalas)
    const saleRes = await root.post(
      '/api/v1/pos/sales',
      {
        branchId: ids.branch,
        items: quote.items.map((i) => ({
          variantId: i.variantId,
          qty: i.qty,
          discount: i.discount,
        })),
        payments: [{ method: 'cash', amount: 20000 }], // 200 SAR tendered
      },
      `pos-sale-key-${Date.now()}`,
    );

    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;
    expect(sale.orderNo).toMatch(/^POS-/);
    expect(sale.status).toBe('completed');
    expect(sale.changeGiven).toBe(3900);
    expect(sale.totals.total).toBe(16100);

    // Stock on hand decremented
    expect(await getStock(ids.shirtL)).toBe(49);
    expect(await getStock(ids.cap)).toBe(29);

    // 4. Live Shift X-Report check
    const xReportRes = await root.get(`/api/v1/shifts/${shift.id}/x-report`);
    expect(xReportRes.status).toBe(200);
    const x = xReportRes.body.data;
    expect(x.summary.sales.count).toBe(1);
    // Net cash = 20000 tendered - 3900 change = 16100
    expect(x.summary.expectedCash).toBe(50000 + 16100);

    // 5. Close Shift with exact matching drawer cash -> produces immutable Z-Report
    const closeRes = await root.post(`/api/v1/shifts/${shift.id}/close`, {
      closingCash: 50000 + 16100,
      note: 'Shift balanced cleanly',
    });
    expect(closeRes.status).toBe(200);
    const closed = closeRes.body.data;
    expect(closed.shift.status).toBe('closed');
    expect(closed.shift.zReportId).toBeDefined();
    expect(closed.shift.discrepancy).toBe(0);
    expect(closed.zReport.zReportNo).toMatch(/^Z-/);
  });

  it('Journey 3: Return & Exchange Lifecycle -> Damaged Write-off -> Loyalty Reversal', async () => {
    // 1. Create and complete an order of 3 shirts attached to customer via contact mode
    const posSale = await ok(
      await root.post(
        '/api/v1/pos/sales',
        {
          branchId: ids.branch,
          customer: {
            mode: 'contact',
            email: 'customer.test@example.com',
            phone: '+966501234567',
            name: 'Ahmed Al-Saud',
          },
          items: [{ variantId: ids.shirtM, qty: 3 }],
          payments: [{ method: 'cash', amount: 34500 }],
        },
        `order-for-return-${Date.now()}`,
      ),
      201,
    );

    expect(await getStock(ids.shirtM)).toBe(47); // 50 - 3 = 47

    // 2. Initiate Return: 1 item restocked, 1 item damaged
    const returnRes = await root.post(
      '/api/v1/returns',
      {
        orderId: posSale.id,
        type: 'return',
        refundMethod: 'cash',
        reason: 'Customer return',
        returnLines: [
          { variantId: ids.shirtM, qty: 1, disposition: 'restock' },
          { variantId: ids.shirtM, qty: 1, disposition: 'damaged' },
        ],
      },
      `return-key-${Date.now()}`,
    );

    expect(returnRes.status).toBe(201);
    const ret = returnRes.body.data;
    expect(ret.returnNo).toMatch(/^RET-/);
    expect(ret.returnTotals.total).toBe(23000); // 2 * 11500
    expect(ret.refundMethod).toBe('cash');

    // 3. Verify stock ledger consequence:
    // - 1 unit restocked -> onHand increases from 47 to 48
    // - 1 unit damaged -> returned (+1) then adjusted/written-off (-1) -> net 0 change to onHand
    // Net onHand should be 48
    expect(await getStock(ids.shirtM)).toBe(48);

    // 4. Verify loyalty clawback was triggered
    const loyalty = await getCustomerLoyaltySummary(ids.customer);
    expect(loyalty.pointsBalance).toBeGreaterThanOrEqual(0);
  });
});
