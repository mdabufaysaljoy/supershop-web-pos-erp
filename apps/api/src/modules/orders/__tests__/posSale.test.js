import { EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { registerCustomer } from '../../customers/index.js';
import { LoyaltyAccount } from '../../loyalty/index.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Order } from '../order.model.js';

/** P6.1 — ringing a sale up at the counter: stock out, money in, done, once. */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'staff-pass-123';
const POS = '/api/v1/pos';
let app;
let rootToken;
const ids = {};
const paid = [];
let offPaid;

const ok = async (res, status = 200) => {
  if (res.status !== status) throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
};
/** A till: the same POST the POS screen makes, with its retry key. */
const till = (token = rootToken) => ({
  quote: (body) =>
    request(app).post(`${POS}/quote`).set('Authorization', `Bearer ${token}`).send(body),
  sell: (body, key) => {
    const r = request(app).post(`${POS}/sales`).set('Authorization', `Bearer ${token}`);
    return (key ? r.set('Idempotency-Key', key) : r).send(body);
  },
});
const onHand = async (variantId, branchId = ids.shop) =>
  (
    await ok(await root.get(`/api/v1/inventory/levels?variantId=${variantId}&branchId=${branchId}`))
  )[0]?.onHand ?? 0;

/** A basket of one shirt (115.00, standard VAT) unless told otherwise. */
const basket = (over = {}) => ({
  branchId: ids.shop,
  items: [{ variantId: ids.red, qty: 1 }],
  payments: [{ method: 'cash', amount: 11_500 }],
  ...over,
});

beforeAll(() => {
  offPaid = eventBus.on(EVENTS.ORDER_PAID, (e) => paid.push(e.payload));
});
afterAll(() => offPaid());

beforeEach(async () => {
  paid.length = 0;
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Order.init();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: PW })
  ).body.data.accessToken;

  ids.shop = (
    await ok(
      await root.post('/api/v1/branches', {
        code: 'SHOP',
        name: 'Shop',
        fulfillsOnlineOrders: false,
      }),
      201,
    )
  ).id;
  ids.other = (await ok(await root.post('/api/v1/branches', { code: 'WEB', name: 'Web' }), 201)).id;

  const shirt = await ok(
    await root.post('/api/v1/products', {
      name: 'Oxford Shirt',
      status: 'active',
      options: [{ name: 'Color', values: [{ label: 'Red' }] }],
      variants: [{ sku: 'OX-RED', optionValues: { color: 'red' }, price: 11_500 }],
    }),
    201,
  );
  ids.red = shirt.variants[0].id;
  const rice = await ok(
    await root.post('/api/v1/products', {
      name: 'Basmati Rice',
      status: 'active',
      taxCategory: 'zero',
      variants: [{ sku: 'RICE-5', price: 3450 }],
    }),
    201,
  );
  ids.rice = rice.variants[0].id;
  await ok(
    await root.post('/api/v1/inventory/receive', {
      branchId: ids.shop,
      lines: [
        { variantId: ids.red, qty: 5 },
        { variantId: ids.rice, qty: 5 },
      ],
    }),
    201,
  );
});

describe('ringing a sale up', () => {
  it('prices it from the catalogue, takes the stock and finishes the order', async () => {
    const before = await onHand(ids.red);
    const sale = await ok(
      await till().sell(
        basket({
          items: [{ variantId: ids.red, qty: 2 }],
          payments: [{ method: 'cash', amount: 23_000 }],
        }),
      ),
      201,
    );

    expect(sale).toMatchObject({
      orderNo: 'POS-000001',
      channel: 'pos',
      status: 'completed',
      changeGiven: 0,
      payment: { method: 'cash', status: 'paid' },
    });
    expect(sale.totals).toMatchObject({
      itemCount: 2,
      subtotal: 23_000,
      discountTotal: 0,
      vat: 3000,
      total: 23_000,
    });
    expect(sale.payments).toEqual([
      { method: 'cash', label: 'Cash', amount: 23_000, reference: null, at: expect.any(String) },
    ]);
    expect(await onHand(ids.red)).toBe(before - 2);
  });

  it('tells the shop it was paid, so loyalty and receipts can follow', async () => {
    const sale = await ok(await till().sell(basket()), 201);
    expect(paid.at(-1)).toMatchObject({
      orderNo: sale.orderNo,
      channel: 'pos',
      total: 11_500,
      paymentMethod: 'cash',
    });
  });

  it('quotes the basket before anyone pays, without touching stock', async () => {
    const before = await onHand(ids.red);
    const quote = await ok(
      await till().quote({ branchId: ids.shop, items: [{ variantId: ids.red, qty: 2 }] }),
    );
    expect(quote.totals).toMatchObject({ total: 23_000, vat: 3000 });
    expect(quote.tender).toEqual({ paid: 0, due: 23_000, change: 0 });
    expect(quote.methods.map((m) => m.key)).toEqual(['cash']); // no payment page at a counter
    expect(await onHand(ids.red)).toBe(before);
  });

  it('splits the money across methods and hands back change from cash', async () => {
    await ok(
      await root.post('/api/v1/payment-methods', { key: 'transfer', label: 'Bank transfer' }),
      201,
    );
    const sale = await ok(
      await till().sell(
        basket({
          payments: [
            { method: 'transfer', amount: 5000, reference: 'TRF-9' },
            { method: 'cash', amount: 7000 },
          ],
        }),
      ),
      201,
    );
    expect(sale.payments.map((p) => [p.method, p.amount])).toEqual([
      ['transfer', 5000],
      ['cash', 7000],
    ]);
    expect(sale.changeGiven).toBe(500);
    // The summary names the method that paid the most.
    expect(sale.payment.method).toBe('cash');
  });

  it('takes cash for the whole bill and more on another method, and gives the rest back', async () => {
    await ok(await root.post('/api/v1/payment-methods', { key: 'wallet', label: 'Wallet' }), 201);
    // Tenders add up: 115 in cash settles the bill, 50 on a wallet is extra, 50 goes back.
    const sale = await ok(
      await till().sell(
        basket({
          payments: [
            { method: 'cash', amount: 11_500 },
            { method: 'wallet', amount: 5000 },
          ],
        }),
      ),
      201,
    );
    expect(sale.payments.map((p) => [p.method, p.amount])).toEqual([
      ['cash', 11_500],
      ['wallet', 5000],
    ]);
    expect(sale.changeGiven).toBe(5000);
  });

  it('refuses change it would have to find somewhere other than the drawer', async () => {
    await ok(await root.post('/api/v1/payment-methods', { key: 'terminal', label: 'Card' }), 201);
    // 150 charged to a card on a 115 bill is not change, it is 35 to refund through the gateway.
    const res = await till().sell(basket({ payments: [{ method: 'terminal', amount: 15_000 }] }));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cash/i);
  });

  it('refuses a sale that is not paid for, saying what is still due', async () => {
    const res = await till().sell(basket({ payments: [{ method: 'cash', amount: 5000 }] }));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatchObject({ path: 'payments', due: 6500 });
  });

  it('refuses an overpayment on anything but cash', async () => {
    await ok(
      await root.post('/api/v1/payment-methods', { key: 'transfer', label: 'Bank transfer' }),
      201,
    );
    const res = await till().sell(basket({ payments: [{ method: 'transfer', amount: 12_000 }] }));
    expect(res.status).toBe(409);
  });

  it('refuses a method the counter cannot take', async () => {
    const res = await till().sell(basket({ payments: [{ method: 'card', amount: 11_500 }] }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('payments.0.method');
  });

  it('allows a walk-in customer to pay via MFS payment method with transaction reference', async () => {
    await ok(
      await root.post('/api/v1/payment-methods', {
        key: 'bkash',
        type: 'mfs',
        label: 'bKash',
        instructions: 'Merchant wallet 01700000000',
      }),
      201,
    );
    const sale = await ok(
      await till().sell(
        basket({
          customer: { mode: 'walkin' },
          payments: [{ method: 'bkash', amount: 11_500, reference: 'TRX998877' }],
        }),
      ),
      201,
    );
    expect(sale.payments).toMatchObject([
      { method: 'bkash', label: 'bKash', amount: 11_500, reference: 'TRX998877' },
    ]);
    expect(sale.payment.method).toBe('bkash');
    expect(sale.customer.name).toBe('Walk-in customer');
  });

  it('sells the same basket once, however often the till retries', async () => {
    const body = basket();
    const first = await ok(await till().sell(body, 'till-1-abc12345'), 201);
    const again = await till().sell(body, 'till-1-abc12345');
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.data.orderNo).toBe(first.orderNo);
    expect(await Order.countDocuments({ channel: 'pos' })).toBe(1);
  });
});

describe('who served', () => {
  it("keeps the cashier's name with the sale, so a receipt can say who rang it up", async () => {
    const sale = await ok(await till().sell(basket()), 201);
    expect(sale.cashierName).toBe('Root Admin');
    const stored = await Order.findOne({ orderNo: sale.orderNo }).lean();
    expect(stored.staffName).toBe('Root Admin');
  });

  it('keeps the branch name too, so the receipt names the shop that sold it', async () => {
    const sale = await ok(await till().sell(basket()), 201);
    expect(sale.branchName).toBeTruthy();
    const stored = await Order.findOne({ orderNo: sale.orderNo }).lean();
    expect(stored.branchName).toBe(sale.branchName);
  });
});

describe('finding something to sell', () => {
  it('finds it by SKU, priced, with what is on this shelf', async () => {
    const found = await ok(
      await request(app)
        .get(`${POS}/search?q=OX-RED&branchId=${ids.shop}`)
        .set('Authorization', `Bearer ${rootToken}`),
    );
    expect(found).toEqual([
      expect.objectContaining({ variantId: ids.red, sku: 'OX-RED', price: 11_500, onHand: 5 }),
    ]);
  });

  it('leaves out what is not for sale', async () => {
    const draft = await ok(
      await root.post('/api/v1/products', {
        name: 'Hidden',
        status: 'draft',
        variants: [{ sku: 'HID-1', price: 100 }],
      }),
      201,
    );
    const found = await ok(
      await request(app)
        .get(`${POS}/search?q=HID-1&branchId=${ids.shop}`)
        .set('Authorization', `Bearer ${rootToken}`),
    );
    expect(found).toEqual([]);
    expect(draft.variants[0].id).toBeTruthy();
  });
});

describe('discounts', () => {
  it('takes a percentage off a line and the rest off the basket', async () => {
    const sale = await ok(
      await till().sell(
        basket({
          items: [
            { variantId: ids.red, qty: 2, discount: { type: 'percent', value: 1000 } },
            { variantId: ids.rice, qty: 1 },
          ],
          orderDiscount: { type: 'amount', value: 1000 },
          payments: [{ method: 'cash', amount: 23_150 }],
        }),
      ),
      201,
    );
    expect(sale.totals).toMatchObject({
      subtotal: 26_450,
      discountTotal: 3300, // 2300 off the shirts, then 1000 off what is left
      total: 23_150,
    });
    expect(sale.items[0].discountTotal).toBeGreaterThan(2300);
    expect(sale.items.reduce((n, i) => n + i.lineTotal, 0)).toBe(sale.totals.total);
  });

  it('refuses a discount larger than the shop allows', async () => {
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [{ key: 'pos.maxDiscountBps', value: 1000 }],
      }),
    );
    const res = await till().sell(
      basket({
        items: [{ variantId: ids.red, qty: 1, discount: { type: 'percent', value: 2000 } }],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('items.0.discount.value');
  });

  it('takes a phone from outside the Kingdom only when the shop allows it', async () => {
    const overseas = basket({
      customer: { mode: 'contact', name: 'Abu Faysal', phone: '+8801741918615' },
    });
    // Off by default: a Saudi shop's numbers are Saudi numbers.
    const refused = await till().sell(overseas);
    expect(refused.status).toBe(400);
    expect(refused.body.error.details[0].path).toBe('customer.phone');

    // The till must obey the setting, not a default compiled into it.
    await ok(
      await root.patch('/api/v1/settings', {
        changes: [{ key: 'customers.allowInternationalPhone', value: true }],
      }),
    );
    const sale = await ok(await till().sell(overseas), 201);
    expect(sale.customer.phone).toBe('+8801741918615');
  });

  it('keeps discounts and price changes to staff who may give them', async () => {
    const role = await ok(
      await root.post('/api/v1/roles', { name: 'Till only', permissions: ['pos.sell'] }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Cassy Cashier',
        email: 'cashier@shop.test',
        password: 'cashier-pass-123',
        roleId: role.id,
        branchIds: [ids.shop],
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'cashier@shop.test', password: 'cashier-pass-123' })
    ).body.data.accessToken;

    expect((await till(token).sell(basket())).status).toBe(201);
    expect(
      (
        await till(token).sell(
          basket({
            items: [{ variantId: ids.red, qty: 1, discount: { type: 'percent', value: 500 } }],
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await till(token).sell(basket({ items: [{ variantId: ids.red, qty: 1, unitPrice: 100 }] })))
        .status,
    ).toBe(403);
  });
});

describe('what the till cannot do', () => {
  it('cannot sell what is not on this branch’s shelf', async () => {
    const res = await till().sell(
      basket({
        items: [{ variantId: ids.red, qty: 99 }],
        payments: [{ method: 'cash', amount: 1 }],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details[0]).toMatchObject({ wanted: 99, available: 5 });
  });

  it('cannot sell from a branch the cashier is not assigned to', async () => {
    const role = await ok(
      await root.post('/api/v1/roles', { name: 'Shop cashier', permissions: ['pos.sell'] }),
      201,
    );
    await ok(
      await root.post('/api/v1/staff', {
        name: 'Omar Till',
        email: 'omar@shop.test',
        password: 'omar-pass-1234',
        roleId: role.id,
        branchIds: [ids.other],
      }),
      201,
    );
    const token = (
      await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ email: 'omar@shop.test', password: 'omar-pass-1234' })
    ).body.data.accessToken;
    expect((await till(token).sell(basket())).status).toBe(403);
  });

  it('needs `pos.sell` at all', async () => {
    expect((await request(app).post(`${POS}/sales`).send(basket())).status).toBe(401);
  });

  it('refuses a product that is not for sale any more', async () => {
    const draft = await ok(
      await root.post('/api/v1/products', {
        name: 'Not ready',
        status: 'draft',
        variants: [{ sku: 'DRAFT-1', price: 1000 }],
      }),
      201,
    );
    const res = await till().sell(basket({ items: [{ variantId: draft.variants[0].id, qty: 1 }] }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('items.0.variantId');
  });
});

describe('who the sale is for', () => {
  it('is a walk-in by default', async () => {
    const sale = await ok(await till().sell(basket()), 201);
    expect(sale.customer).toMatchObject({ name: 'Walk-in customer' });
  });

  it('attaches the customer behind a phone number the shop already knows', async () => {
    const { profile: customer } = await registerCustomer({
      name: 'Sara Ali',
      phone: '+966512345678',
      email: 'sara@example.com',
      password: 'customer-pass-123',
    });
    const sale = await ok(
      await till().sell(
        basket({ customer: { mode: 'contact', name: 'Sara Ali', phone: '0512345678' } }),
      ),
      201,
    );
    expect(sale.customer).toMatchObject({ name: 'Sara Ali', phone: '+966512345678' });
    const stored = await Order.findOne({ orderNo: sale.orderNo }).lean();
    expect(String(stored.customer.customerId)).toBe(customer.id);
  });

  it('spends the customer’s points on the sale, and takes them off the ledger with it', async () => {
    // The shop's defaults: a point is worth a riyal, and at least 10 at a time.
    const { profile: customer } = await registerCustomer({
      name: 'Layla Hassan',
      phone: '+966512345671',
      email: 'layla@example.com',
      password: 'customer-pass-123',
    });
    // Points put on the card directly: this test is about the SALE, not about how they got there.
    await LoyaltyAccount.create({ customerId: customer.id, pointsBalance: 300 });
    const sale = await ok(
      await till().sell(
        basket({
          customer: { mode: 'contact', customerId: customer.id },
          redeemPoints: 25,
          payments: [{ method: 'cash', amount: 9000 }],
        }),
      ),
      201,
    );
    // 115.00 less 25 points at 1.00 each = 90.00, with VAT on what is actually paid.
    expect(sale.totals.total).toBe(9000);
    expect(sale.totals.discountTotal).toBe(2500);
    expect(sale.totals.net + sale.totals.vat).toBe(sale.totals.total);
    expect(sale.loyalty).toMatchObject({ pointsRedeemed: 25, valueHalalas: 2500 });

    // And the points are gone from the ledger — one write with the sale, not a hope afterwards.
    const account = await LoyaltyAccount.findOne({ customerId: customer.id }).lean();
    expect(account.pointsBalance).toBe(275);
    expect(account.lifetimeRedeemed).toBe(25);
  });

  it('refuses points the customer does not have, and sells nothing', async () => {
    const { profile: customer } = await registerCustomer({
      name: 'Omar Saleh',
      phone: '+966512345679',
      email: 'omar@example.com',
      password: 'customer-pass-123',
    });
    const before = await Order.countDocuments({ channel: 'pos' });
    const res = await till().sell(
      basket({ customer: { mode: 'contact', customerId: customer.id }, redeemPoints: 5000 }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await Order.countDocuments({ channel: 'pos' })).toBe(before);
  });

  it('refuses points on a walk-in sale: there is nobody to take them from', async () => {
    const res = await till().sell(basket({ redeemPoints: 10 }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toContain('redeemPoints');
  });

  it('attaches the customer the till picked, by id, and fills in what it did not send', async () => {
    const { profile: customer } = await registerCustomer({
      name: 'Sara Ali',
      phone: '+966512345678',
      email: 'sara@example.com',
      password: 'customer-pass-123',
    });
    // What the till sends once the cashier picks someone from the shop's own list: an id, and
    // whatever is on screen. An empty field means "not given", not a validation failure.
    const sale = await ok(
      await till().sell(
        basket({
          customer: {
            mode: 'contact',
            customerId: customer.id,
            name: 'Sara Ali',
            phone: '0512345678',
            email: '',
          },
        }),
      ),
      201,
    );
    const stored = await Order.findOne({ orderNo: sale.orderNo }).lean();
    expect(String(stored.customer.customerId)).toBe(customer.id);
    expect(stored.customer.email).toBe('sara@example.com'); // taken from the account
  });

  it('refuses a customer the till invented out of nothing', async () => {
    const res = await till().sell(basket({ customer: { mode: 'contact', name: 'Nobody' } }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('customer.phone');
  });

  it('keeps somebody typed in at the counter, so the next sale already knows them', async () => {
    const sale = await ok(
      await till().sell(
        basket({ customer: { mode: 'contact', name: 'Nora Said', phone: '0599999999' } }),
      ),
      201,
    );
    const stored = await Order.findOne({ orderNo: sale.orderNo }).lean();
    expect(stored.customer.phone).toBe('+966599999999');
    // The shop has them now — on the customers list, with the sale against their name.
    expect(stored.customer.customerId).not.toBeNull();
    const listed = await ok(await root.get('/api/v1/customers?q=0599999999'));
    expect(listed.map((c) => c.name)).toContain('Nora Said');

    // And a second sale to the same number attaches the SAME record, not another one.
    const again = await ok(
      await till().sell(
        basket({ customer: { mode: 'contact', name: 'Nora Said', phone: '0599999999' } }),
      ),
      201,
    );
    const second = await Order.findOne({ orderNo: again.orderNo }).lean();
    expect(String(second.customer.customerId)).toBe(String(stored.customer.customerId));
  });
});
