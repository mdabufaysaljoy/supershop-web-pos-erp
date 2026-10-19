import { ERROR_CODES, EVENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { registerCustomer } from '../../customers/index.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { seedPaymentMethods } from '../../paymentMethods/index.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { LoyaltyAccount, LoyaltyLedger } from '../loyalty.model.js';
import { earnPointsForOrder, expirePoints, reversePointsForReturn } from '../loyalty.service.js';

/**
 * P7.1 — Loyalty engine: earn rule (default 100 SAR = 1 pt, configurable),
 * redeem rule, ledger, membership by phone/email, expiry option, reversal on returns.
 */
useMemoryMongo({ beforeAll, afterAll, afterEach });

const PW = 'password-123';
let app;
const tokens = {};
let customerUser = null;

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

const loginStaff = async (email) =>
  (await request(app).post('/api/v1/auth/staff/login').send({ email, password: PW })).body.data
    .accessToken;

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Order.init(), LoyaltyAccount.init(), LoyaltyLedger.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await seedPaymentMethods();

  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: PW });
  tokens.root = await loginStaff('root@shop.test');

  const cashierRoleId = await findSystemRoleId('cashier');
  await createStaff(null, {
    name: 'Cara Cashier',
    email: 'cara@shop.test',
    password: PW,
    roleId: cashierRoleId,
    branchIds: [],
  });
  tokens.cara = await loginStaff('cara@shop.test');

  const reg = await registerCustomer({
    name: 'Tariq Al-Harbi',
    email: 'tariq@customer.test',
    phone: '+966501234567',
    password: PW,
  });
  tokens.tariq = reg.tokens.accessToken;
  customerUser = reg.profile;
});

describe('P7.1 Loyalty Engine', () => {
  it('looks up customer membership by phone, email, or customerId and initializes account', async () => {
    // 1. Lookup by phone
    const byPhone = await ok(await as('cara').get('/api/v1/loyalty/lookup?q=+966501234567'));
    expect(byPhone).toMatchObject({
      customerId: customerUser.id,
      pointsBalance: 0,
      lifetimeEarned: 0,
      tier: 'bronze',
      customer: {
        id: customerUser.id,
        name: 'Tariq Al-Harbi',
        phone: '+966501234567',
        email: 'tariq@customer.test',
      },
    });

    // 2. Lookup by email
    const byEmail = await ok(await as('cara').get('/api/v1/loyalty/lookup?q=tariq@customer.test'));
    expect(byEmail.customerId).toBe(customerUser.id);

    // 3. Lookup by customerId
    const byId = await ok(await as('cara').get(`/api/v1/loyalty/lookup?q=${customerUser.id}`));
    expect(byId.customerId).toBe(customerUser.id);
  });

  it('earns loyalty points on order completion (100 SAR = 1 pt) idempotently', async () => {
    // 350 SAR order spend (35,000 halalas) -> 3 points
    const result1 = await earnPointsForOrder({
      customerId: customerUser.id,
      orderId: '507f1f77bcf86cd799439001',
      orderNo: 'ORD-101',
      totalHalalas: 35_000,
      channel: 'online',
    });

    expect(result1).toMatchObject({
      points: 3,
      replayed: false,
      account: {
        pointsBalance: 3,
        lifetimeEarned: 3,
      },
      ledgerEntry: {
        type: 'earn',
        points: 3,
        balanceAfter: 3,
        source: { type: 'order', docNo: 'ORD-101' },
      },
    });

    // Idempotent retry of same order: points not duplicated
    const result2 = await earnPointsForOrder({
      customerId: customerUser.id,
      orderId: '507f1f77bcf86cd799439001',
      orderNo: 'ORD-101',
      totalHalalas: 35_000,
      channel: 'online',
    });
    expect(result2.replayed).toBe(true);
    expect(result2.points).toBe(3);

    // Ledger contains exactly 1 earn entry
    const ledger = await as('root').get(`/api/v1/loyalty/customers/${customerUser.id}/ledger`);
    const ledgerData = await ok(ledger);
    expect(ledgerData).toHaveLength(1);
    expect(ledgerData[0].points).toBe(3);
  });

  it('reverses loyalty points when a return/refund occurs', async () => {
    // Initial earn: 400 SAR spend (40,000 halalas) -> 4 points
    await earnPointsForOrder({
      customerId: customerUser.id,
      orderId: '507f1f77bcf86cd799439002',
      orderNo: 'ORD-102',
      totalHalalas: 40_000,
    });

    // Customer returns 200 SAR worth of goods (20,000 halalas) -> claws back 2 points
    const reversed = await reversePointsForReturn({
      returnId: '507f1f77bcf86cd799439099',
      returnNo: 'RET-201',
      orderId: '507f1f77bcf86cd799439002',
      orderNo: 'ORD-102',
      customerId: customerUser.id,
      amount: 20_000,
    });

    expect(reversed).toMatchObject({
      pointsReversed: 2,
      account: {
        pointsBalance: 2, // 4 - 2 = 2
      },
      ledgerEntry: {
        type: 'reverse',
        points: -2,
        balanceAfter: 2,
        source: { type: 'return', docNo: 'RET-201' },
      },
    });

    // Retry is idempotent
    const retry = await reversePointsForReturn({
      returnId: '507f1f77bcf86cd799439099',
      returnNo: 'RET-201',
      orderId: '507f1f77bcf86cd799439002',
      orderNo: 'ORD-102',
      customerId: customerUser.id,
      amount: 20_000,
    });
    expect(retry.replayed).toBe(true);

    const summary = await ok(await as('root').get(`/api/v1/loyalty/customers/${customerUser.id}`));
    expect(summary.pointsBalance).toBe(2);
  });

  it('allows staff with loyalty.adjust to manually adjust points and upgrades tier', async () => {
    // 1. Unauthorized cashier cannot adjust
    const forbidden = await as('cara').post('/api/v1/loyalty/adjust', {
      customerId: customerUser.id,
      delta: 100,
      reason: 'Should be denied',
    });
    expect(forbidden.status).toBe(403);

    // 2. Root adds 120 points -> lifetime reaches 120, tier upgrades to silver (threshold: 100)
    const adjusted = await ok(
      await as('root').post('/api/v1/loyalty/adjust', {
        customerId: customerUser.id,
        delta: 120,
        reason: 'VIP welcome gift',
      }),
    );
    expect(adjusted.account).toMatchObject({
      pointsBalance: 120,
      lifetimeEarned: 120,
      tier: 'silver',
    });

    // 3. Subtracting points works as long as balance stays >= 0
    const deducted = await ok(
      await as('root').post('/api/v1/loyalty/adjust', {
        customerId: customerUser.id,
        delta: -20,
        reason: 'Manual correction',
      }),
    );
    expect(deducted.account.pointsBalance).toBe(100);

    // 4. Over-deduction is refused with LOYALTY_INSUFFICIENT_POINTS
    const overDeduct = await as('root').post('/api/v1/loyalty/adjust', {
      customerId: customerUser.id,
      delta: -150,
      reason: 'Too much',
    });
    expect(overDeduct.status).toBe(409);
    expect(overDeduct.body.error.code).toBe(ERROR_CODES.LOYALTY_INSUFFICIENT_POINTS);
  });

  it('quotes redemption discount and executes point redemption', async () => {
    // Credit 50 points to customer
    await as('root').post('/api/v1/loyalty/adjust', {
      customerId: customerUser.id,
      delta: 50,
      reason: 'Seed points',
    });

    // 1. Quote redemption for 30 points on 10,000 halalas (100 SAR) order
    const quote = await ok(
      await as('tariq').post('/api/v1/loyalty/quote', {
        points: 30,
        orderTotalHalalas: 10_000,
      }),
    );
    // 30 points at 100 halalas/pt = 3,000 halalas (30 SAR)
    expect(quote).toMatchObject({
      allowed: true,
      points: 30,
      discountHalalas: 3_000,
      currentBalance: 50,
    });

    // 2. Cashier redeems 30 points at checkout
    const redeemed = await ok(
      await as('cara').post('/api/v1/loyalty/redeem', {
        customerId: customerUser.id,
        points: 30,
        orderId: '507f1f77bcf86cd799439003',
        orderNo: 'POS-301',
        orderTotalHalalas: 10_000,
      }),
      201,
    );
    expect(redeemed).toMatchObject({
      pointsRedeemed: 30,
      discountHalalas: 3_000,
      account: {
        pointsBalance: 20, // 50 - 30 = 20
        lifetimeRedeemed: 30,
      },
    });

    // 3. Attempting to redeem more than remaining balance (20) fails
    const failRedeem = await as('cara').post('/api/v1/loyalty/redeem', {
      customerId: customerUser.id,
      points: 25,
      orderId: '507f1f77bcf86cd799439004',
      orderNo: 'POS-302',
    });
    expect(failRedeem.status).toBe(409);
    expect(failRedeem.body.error.code).toBe(ERROR_CODES.LOYALTY_INSUFFICIENT_POINTS);
  });

  it('expires past-due points and records expiry transaction in ledger', async () => {
    // Earn 10 points
    await earnPointsForOrder({
      customerId: customerUser.id,
      orderId: '507f1f77bcf86cd799439005',
      orderNo: 'ORD-105',
      totalHalalas: 100_000,
    });

    // Set expiresAt to the past
    const pastDate = new Date(Date.now() - 1000 * 60);
    await LoyaltyLedger.collection.updateOne(
      { 'source.id': '507f1f77bcf86cd799439005' },
      { $set: { expiresAt: pastDate } },
    );

    // Run expiry sweep
    const sweep = await expirePoints({ now: new Date() });
    expect(sweep.expiredCount).toBe(1);
    expect(sweep.pointsExpired).toBe(10);

    // Account pointsBalance is now 0
    const account = await LoyaltyAccount.findOne({ customerId: customerUser.id }).lean();
    expect(account.pointsBalance).toBe(0);

    // Ledger has an 'expire' record
    const expireEntry = await LoyaltyLedger.findOne({
      customerId: customerUser.id,
      type: 'expire',
    }).lean();
    expect(expireEntry).toMatchObject({
      type: 'expire',
      points: -10,
      balanceAfter: 0,
    });
  });

  it('serves customer self-service account and ledger endpoints', async () => {
    // Add points
    await as('root').post('/api/v1/loyalty/adjust', {
      customerId: customerUser.id,
      delta: 15,
      reason: 'Self-service check',
    });

    // Customer views own loyalty account
    const selfAccount = await ok(await as('tariq').get('/api/v1/account/loyalty'));
    expect(selfAccount).toMatchObject({
      customerId: customerUser.id,
      pointsBalance: 15,
      tier: 'bronze',
    });

    // Customer views own ledger history
    const selfLedger = await ok(await as('tariq').get('/api/v1/account/loyalty/ledger'));
    expect(selfLedger).toHaveLength(1);
    expect(selfLedger[0].points).toBe(15);
  });

  it('eventBus subscribers automatically award points on ORDER_COMPLETED and reverse on LOYALTY_REVERSED', async () => {
    // 1. Emit ORDER_COMPLETED on eventBus
    void eventBus.emit(EVENTS.ORDER_COMPLETED, {
      customerId: customerUser.id,
      orderId: '507f1f77bcf86cd799439009',
      orderNo: 'ORD-AUTO-1',
      total: 50_000, // 500 SAR -> 5 points
      channel: 'pos',
    });

    await new Promise((resolve) => setTimeout(resolve, 80));

    let account = await LoyaltyAccount.findOne({ customerId: customerUser.id }).lean();
    expect(account.pointsBalance).toBe(5);

    // 2. Emit LOYALTY_REVERSED on eventBus
    void eventBus.emit(EVENTS.LOYALTY_REVERSED, {
      returnId: '507f1f77bcf86cd799439088',
      returnNo: 'RET-AUTO-1',
      orderId: '507f1f77bcf86cd799439009',
      orderNo: 'ORD-AUTO-1',
      customerId: customerUser.id,
      amount: 20_000, // 200 SAR return -> 2 points reversed
    });

    await new Promise((resolve) => setTimeout(resolve, 80));

    account = await LoyaltyAccount.findOne({ customerId: customerUser.id }).lean();
    expect(account.pointsBalance).toBe(3); // 5 - 2 = 3
  });

  it('issues a loyalty card with fee and finds customer by card number or QR code scan', async () => {
    // 1. Issue card with card fee 2500 halalas (25 SAR)
    const cardRes = await ok(
      await as('root').post(`/api/v1/loyalty/customers/${customerUser.id}/issue-card`, {
        cardNumber: 'LOY-99887766',
        feeHalalas: 2500,
      }),
      201,
    );
    expect(cardRes.cardNumber).toBe('LOY-99887766');
    expect(cardRes.cardFeeHalalas).toBe(2500);
    expect(cardRes.cardStatus).toBe('active');

    // 2. Lookup by card number
    const lookupDirect = await ok(await as('cara').get('/api/v1/loyalty/lookup?q=LOY-99887766'));
    expect(lookupDirect.customer.id).toBe(customerUser.id);
    expect(lookupDirect.cardNumber).toBe('LOY-99887766');

    // 3. Lookup by QR code JSON payload
    const qrPayload = JSON.stringify({ type: 'loyalty_card', cardNumber: 'LOY-99887766' });
    const lookupQr = await ok(
      await as('cara').get(`/api/v1/loyalty/lookup?q=${encodeURIComponent(qrPayload)}`),
    );
    expect(lookupQr.customer.id).toBe(customerUser.id);

    // 4. Lookup by card route GET /api/v1/loyalty/card/:cardNumber
    const cardRoute = await ok(await as('cara').get('/api/v1/loyalty/card/LOY-99887766'));
    expect(cardRoute.customer.id).toBe(customerUser.id);
  });
});
