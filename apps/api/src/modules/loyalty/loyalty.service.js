import mongoose from 'mongoose';
import {
  calculateEarnedPoints,
  calculateReversedPoints,
  computeTier,
  ERROR_CODES,
  EVENTS,
  isRedemptionAllowed,
  LOYALTY,
  validators,
} from '@supershop/shared';
import { withTransaction } from '../../core/db.js';
import { AppError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { findCustomerByEmail, findCustomerById, findCustomerByPhone } from '../customers/index.js';
import { getSetting } from '../settings/index.js';
import * as repo from './loyalty.repo.js';

const oid = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
const str = (id) => (id == null ? null : String(id));
const refuse = (code, message, details) => new AppError(code, message, { status: 409, details });

export const toLoyaltyAccountDto = (account, customer = null) => ({
  id: str(account._id),
  customerId: str(account.customerId),
  pointsBalance: account.pointsBalance ?? 0,
  lifetimeEarned: account.lifetimeEarned ?? 0,
  lifetimeRedeemed: account.lifetimeRedeemed ?? 0,
  tier: account.tier ?? LOYALTY.TIERS.BRONZE,
  status: account.status ?? LOYALTY.MEMBERSHIP_STATUSES.ACTIVE,
  cardNumber: account.cardNumber ?? null,
  cardIssuedAt: account.cardIssuedAt ?? null,
  cardFeeHalalas: account.cardFeeHalalas ?? 0,
  cardStatus: account.cardStatus ?? 'active',
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
  ...(customer && {
    customer: {
      id: str(customer._id),
      name: customer.name,
      email: customer.email ?? null,
      phone: customer.phone ?? null,
    },
  }),
});

export const toLoyaltyLedgerDto = (entry) => ({
  id: str(entry._id),
  accountId: str(entry.accountId),
  customerId: str(entry.customerId),
  type: entry.type,
  points: entry.points,
  balanceAfter: entry.balanceAfter,
  source: entry.source ?? { type: 'manual' },
  reason: entry.reason ?? null,
  expiresAt: entry.expiresAt ?? null,
  actorId: str(entry.actorId),
  createdAt: entry.createdAt,
});

/**
 * Gets or creates the customer's loyalty account.
 */
export async function getOrCreateAccount(customerId, { session } = {}) {
  const existing = await repo.findAccountByCustomerId(customerId, { session });
  if (existing) return existing;

  try {
    return await repo.createAccount(
      {
        customerId: oid(customerId),
        pointsBalance: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        tier: LOYALTY.TIERS.BRONZE,
        status: LOYALTY.MEMBERSHIP_STATUSES.ACTIVE,
      },
      { session },
    );
  } catch (err) {
    // In case of a concurrent creation race, re-fetch
    const raced = await repo.findAccountByCustomerId(customerId, { session });
    if (raced) return raced;
    throw err;
  }
}

/**
 * Looks up customer membership by phone, email, customerId, or scanned loyalty card (barcode/QR).
 * Returns customer profile + loyalty account + balance + tier.
 */
export async function lookupMembership(query) {
  const raw = String(query ?? '').trim();
  if (!raw) return null;

  // Extract from potential QR payload (JSON or URL)
  let candidate = raw;
  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      const parsed = JSON.parse(candidate);
      candidate = parsed.cardNumber || parsed.card || parsed.customerId || candidate;
    } catch {
      // ignore
    }
  }
  const urlMatch = candidate.match(/\/loyalty\/card\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) candidate = urlMatch[1];

  // 1. Try card number / barcode direct match
  const byCard = await repo.findAccountByCardNumber(candidate);
  if (byCard) {
    const customer = await findCustomerById(byCard.customerId);
    if (customer) return toLoyaltyAccountDto(byCard, customer);
  }

  // 2. Try customer ID, email, phone
  let customer = null;
  if (mongoose.isValidObjectId(candidate)) {
    customer = await findCustomerById(candidate);
  }
  if (!customer && candidate.includes('@')) {
    customer = await findCustomerByEmail(candidate.toLowerCase());
  }
  if (!customer) {
    const normalized = validators.normalizePhone(candidate, { allowInternational: true });
    if (normalized) {
      customer = await findCustomerByPhone(normalized);
    }
  }
  if (!customer) {
    // Try raw string as phone directly if standard normalizer didn't match
    customer = await findCustomerByPhone(candidate);
  }

  if (!customer) return null;

  const account = await getOrCreateAccount(customer._id);
  return toLoyaltyAccountDto(account, customer);
}

/**
 * Issues a loyalty card to a customer with optional card number and issuance fee.
 */
export async function issueCard({
  customerId,
  cardNumber = null,
  feeHalalas = null,
  actorId = null,
}) {
  const customer = await findCustomerById(customerId);
  if (!customer) throw new NotFoundError('Customer not found');

  const defaultFee = getSetting('loyalty.cardIssuanceFee') ?? 0;
  const finalFee = feeHalalas != null ? feeHalalas : defaultFee;

  let finalCardNumber = cardNumber ? String(cardNumber).trim().toUpperCase() : null;
  if (!finalCardNumber) {
    // Generate barcode-friendly code: LC + 8 digits
    const rand = Math.floor(10000000 + Math.random() * 90000000);
    finalCardNumber = `LC${rand}`;
  }

  // Check if card number already assigned to another customer
  const existing = await repo.findAccountByCardNumber(finalCardNumber);
  if (existing && String(existing.customerId) !== String(customerId)) {
    throw new AppError(ERROR_CODES.CONFLICT, 'Card number already assigned to another customer', {
      status: 409,
    });
  }

  const account = await getOrCreateAccount(customerId);

  const updated = await repo.updateAccountCard(account._id, {
    cardNumber: finalCardNumber,
    cardIssuedAt: new Date(),
    cardFeeHalalas: finalFee,
    cardStatus: 'active',
  });

  if (finalFee > 0) {
    await repo.insertLedgerEntry({
      accountId: account._id,
      customerId: oid(customerId),
      type: LOYALTY.TRANSACTION_TYPES.ADJUST,
      points: 0,
      balanceAfter: updated.pointsBalance,
      source: {
        type: 'manual',
        id: finalCardNumber,
        docNo: 'CARD-ISSUANCE',
      },
      reason: `Loyalty card ${finalCardNumber} issued with fee ${finalFee}`,
      actorId: actorId ? oid(actorId) : null,
    });
  }

  void eventBus.emit(EVENTS.LOYALTY_CARD_ISSUED, {
    customerId: str(customerId),
    cardNumber: finalCardNumber,
    feeHalalas: finalFee,
    actorId: str(actorId),
  });

  return toLoyaltyAccountDto(updated, customer);
}

/**
 * Awards loyalty points for an order.
 * Idempotent by orderId in the append-only ledger.
 */
export async function earnPointsForOrder(
  { customerId, orderId, orderNo, totalHalalas, channel = 'online' },
  { session = null } = {},
) {
  if (!customerId || !orderId) return null;
  if (!getSetting('features.loyalty')) return null;

  // Check idempotency: order already has an 'earn' entry in ledger
  const existing = await repo.findLedgerBySource('order', str(orderId), { session });
  if (existing && existing.type === LOYALTY.TRANSACTION_TYPES.EARN) {
    return { ledgerEntry: toLoyaltyLedgerDto(existing), points: existing.points, replayed: true };
  }

  const earnRate = getSetting('loyalty.earnSpendRate');
  const points = calculateEarnedPoints(totalHalalas, earnRate);
  if (points <= 0) return null;

  const expiryDays = getSetting('loyalty.expiryDays');
  const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86_400_000) : null;

  const execute = async (s) => {
    const account = await getOrCreateAccount(customerId, { session: s });
    const newBalance = account.pointsBalance + points;
    const newLifetimeEarned = account.lifetimeEarned + points;
    const newTier = computeTier(newLifetimeEarned);

    const ledgerEntry = await repo.insertLedgerEntry(
      {
        accountId: account._id,
        customerId: oid(customerId),
        type: LOYALTY.TRANSACTION_TYPES.EARN,
        points,
        balanceAfter: newBalance,
        source: {
          type: 'order',
          id: str(orderId),
          docNo: orderNo ?? null,
        },
        reason: `Earned from order ${orderNo ?? str(orderId)}`,
        expiresAt,
        actorId: null,
      },
      { session: s },
    );

    const updatedAccount = await repo.updateAccountBalance(
      account._id,
      {
        delta: points,
        lifetimeEarnedDelta: points,
        tier: newTier,
      },
      { session: s },
    );

    return { account: updatedAccount, ledgerEntry, points, replayed: false };
  };

  const result = session ? await execute(session) : await withTransaction(execute);

  void eventBus.emit(EVENTS.LOYALTY_EARNED, {
    customerId: str(customerId),
    orderId: str(orderId),
    orderNo: orderNo ?? null,
    points,
    balanceAfter: result.account.pointsBalance,
    tier: result.account.tier,
    channel,
  });

  return {
    account: toLoyaltyAccountDto(result.account),
    ledgerEntry: toLoyaltyLedgerDto(result.ledgerEntry),
    points,
    replayed: false,
  };
}

/**
 * Reverses loyalty points when goods are returned for a refund.
 * Subscribes to EVENTS.LOYALTY_REVERSED or called directly.
 */
export async function reversePointsForReturn(
  { returnId, returnNo, orderId: _orderId, orderNo: _orderNo, customerId, amount, actorId = null },
  { session = null } = {},
) {
  if (!customerId || !returnId || !amount || amount <= 0) return null;
  if (!getSetting('features.loyalty')) return null;

  // Idempotency check: return already reversed in ledger
  const existing = await repo.findLedgerBySource('return', str(returnId), { session });
  if (existing && existing.type === LOYALTY.TRANSACTION_TYPES.REVERSE) {
    return { ledgerEntry: toLoyaltyLedgerDto(existing), points: existing.points, replayed: true };
  }

  const earnRate = getSetting('loyalty.earnSpendRate');
  const pointsToReverse = calculateReversedPoints(amount, earnRate);
  if (pointsToReverse <= 0) return null;

  const execute = async (s) => {
    const account = await getOrCreateAccount(customerId, { session: s });
    // Claw back up to current balance (balance never negative)
    const deduct = Math.min(account.pointsBalance, pointsToReverse);
    if (deduct <= 0) return null;

    const newBalance = account.pointsBalance - deduct;

    const ledgerEntry = await repo.insertLedgerEntry(
      {
        accountId: account._id,
        customerId: oid(customerId),
        type: LOYALTY.TRANSACTION_TYPES.REVERSE,
        points: -deduct,
        balanceAfter: newBalance,
        source: {
          type: 'return',
          id: str(returnId),
          docNo: returnNo ?? null,
        },
        reason: `Reversal for return ${returnNo ?? str(returnId)}`,
        actorId: actorId ? oid(actorId) : null,
      },
      { session: s },
    );

    const updatedAccount = await repo.updateAccountBalance(
      account._id,
      { delta: -deduct },
      { session: s },
    );

    return { account: updatedAccount, ledgerEntry, pointsReversed: deduct };
  };

  const result = session ? await execute(session) : await withTransaction(execute);
  if (!result) return null;

  return {
    account: toLoyaltyAccountDto(result.account),
    ledgerEntry: toLoyaltyLedgerDto(result.ledgerEntry),
    pointsReversed: result.pointsReversed,
  };
}

/**
 * Calculates quotes and validation for redeeming loyalty points.
 */
export async function quoteRedemption({ customerId = null, points, orderTotalHalalas = null }) {
  if (!getSetting('features.loyalty')) {
    return {
      allowed: false,
      discountHalalas: 0,
      code: ERROR_CODES.LOYALTY_DISABLED,
      reason: 'Loyalty program is disabled',
    };
  }

  const pointValue = getSetting('loyalty.pointRedemptionValue');
  const minRedeem = getSetting('loyalty.minRedeemPoints');
  const maxRedeem = getSetting('loyalty.maxRedeemPointsPerOrder');

  let currentBalance = 0;
  if (customerId) {
    const account = await repo.findAccountByCustomerId(customerId);
    currentBalance = account?.pointsBalance ?? 0;
  } else {
    // If quote is requested without customer context, simulate against requested points
    currentBalance = points;
  }

  const check = isRedemptionAllowed({
    points,
    currentBalance,
    minRedeemPoints: minRedeem,
    maxRedeemPointsPerOrder: maxRedeem,
    orderTotalHalalas,
    pointRedemptionValue: pointValue,
  });

  return {
    ...check,
    points,
    pointRedemptionValue: pointValue,
    currentBalance,
  };
}

/**
 * Deducts points for an order redemption in the append-only ledger.
 */
export async function redeemPoints(
  { customerId, points, orderId = null, orderNo = null, orderTotalHalalas = null },
  { session = null } = {},
) {
  if (!getSetting('features.loyalty')) {
    throw refuse(ERROR_CODES.LOYALTY_DISABLED, 'Loyalty program is disabled');
  }

  const pointValue = getSetting('loyalty.pointRedemptionValue');
  const minRedeem = getSetting('loyalty.minRedeemPoints');
  const maxRedeem = getSetting('loyalty.maxRedeemPointsPerOrder');

  const execute = async (s) => {
    const account = await repo.findAccountByCustomerId(customerId, { session: s });
    if (!account) {
      throw refuse(ERROR_CODES.LOYALTY_ACCOUNT_NOT_FOUND, 'Loyalty account not found');
    }

    const check = isRedemptionAllowed({
      points,
      currentBalance: account.pointsBalance,
      minRedeemPoints: minRedeem,
      maxRedeemPointsPerOrder: maxRedeem,
      orderTotalHalalas,
      pointRedemptionValue: pointValue,
    });

    if (!check.allowed) {
      throw refuse(check.code || ERROR_CODES.LOYALTY_INSUFFICIENT_POINTS, check.reason);
    }

    const newBalance = account.pointsBalance - points;

    const ledgerEntry = await repo.insertLedgerEntry(
      {
        accountId: account._id,
        customerId: oid(customerId),
        type: LOYALTY.TRANSACTION_TYPES.REDEEM,
        points: -points,
        balanceAfter: newBalance,
        source: {
          type: 'order',
          id: orderId ? str(orderId) : null,
          docNo: orderNo ?? null,
        },
        reason: orderNo ? `Redeemed on order ${orderNo}` : 'Points redemption',
      },
      { session: s },
    );

    const updatedAccount = await repo.updateAccountBalance(
      account._id,
      {
        delta: -points,
        lifetimeRedeemedDelta: points,
      },
      { session: s },
    );

    return {
      account: updatedAccount,
      ledgerEntry,
      pointsRedeemed: points,
      discountHalalas: check.discountHalalas,
    };
  };

  const result = session ? await execute(session) : await withTransaction(execute);

  void eventBus.emit(EVENTS.LOYALTY_REDEEMED, {
    customerId: str(customerId),
    orderId: orderId ? str(orderId) : null,
    orderNo: orderNo ?? null,
    points,
    discountHalalas: result.discountHalalas,
    balanceAfter: result.account.pointsBalance,
  });

  return {
    account: toLoyaltyAccountDto(result.account),
    ledgerEntry: toLoyaltyLedgerDto(result.ledgerEntry),
    pointsRedeemed: result.pointsRedeemed,
    discountHalalas: result.discountHalalas,
  };
}

/**
 * Manual staff adjustment of customer points (requires loyalty.adjust permission).
 */
export async function adjustPoints(actor, { customerId, delta, reason }) {
  if (!getSetting('features.loyalty')) {
    throw refuse(ERROR_CODES.LOYALTY_DISABLED, 'Loyalty program is disabled');
  }

  const result = await withTransaction(async (s) => {
    const account = await getOrCreateAccount(customerId, { session: s });
    if (delta < 0 && account.pointsBalance + delta < 0) {
      throw refuse(
        ERROR_CODES.LOYALTY_INSUFFICIENT_POINTS,
        `Cannot deduct ${Math.abs(delta)} points from balance of ${account.pointsBalance}`,
      );
    }

    const newBalance = account.pointsBalance + delta;
    const newLifetimeEarned = delta > 0 ? account.lifetimeEarned + delta : account.lifetimeEarned;
    const newTier = computeTier(newLifetimeEarned);

    const ledgerEntry = await repo.insertLedgerEntry(
      {
        accountId: account._id,
        customerId: oid(customerId),
        type: LOYALTY.TRANSACTION_TYPES.ADJUST,
        points: delta,
        balanceAfter: newBalance,
        source: { type: 'manual' },
        reason,
        actorId: actor?.staffId ? oid(actor.staffId) : null,
      },
      { session: s },
    );

    const updatedAccount = await repo.updateAccountBalance(
      account._id,
      {
        delta,
        ...(delta > 0 && { lifetimeEarnedDelta: delta }),
        tier: newTier,
      },
      { session: s },
    );

    return { account: updatedAccount, ledgerEntry };
  });

  void eventBus.emit(EVENTS.LOYALTY_ADJUSTED, {
    customerId: str(customerId),
    delta,
    balanceAfter: result.account.pointsBalance,
    actorId: actor?.staffId ?? null,
    reason,
  });

  return {
    account: toLoyaltyAccountDto(result.account),
    ledgerEntry: toLoyaltyLedgerDto(result.ledgerEntry),
  };
}

/**
 * Sweeps past-due earn entries and writes 'expire' records to the append-only ledger.
 */
export async function expirePoints({ now = new Date(), limit = 100 } = {}) {
  if (!getSetting('features.loyalty')) return { expiredCount: 0, pointsExpired: 0 };
  const expiryDays = getSetting('loyalty.expiryDays');
  if (expiryDays <= 0) return { expiredCount: 0, pointsExpired: 0 };

  const eligibleEarns = await repo.findEarnEntriesEligibleForExpiry(now, { limit });
  let expiredCount = 0;
  let totalPointsExpired = 0;

  for (const earn of eligibleEarns) {
    // Idempotency check: has this earn entry already triggered an expiry ledger record?
    const alreadyExpired = await repo.findLedgerBySource('expiry', str(earn._id));
    if (alreadyExpired) continue;

    const expired = await withTransaction(async (s) => {
      const account = await repo.findAccountById(earn.accountId, { session: s });
      if (!account || account.pointsBalance <= 0) return null;

      const toExpire = Math.min(earn.points, account.pointsBalance);
      if (toExpire <= 0) return null;

      const newBalance = account.pointsBalance - toExpire;

      const ledgerEntry = await repo.insertLedgerEntry(
        {
          accountId: account._id,
          customerId: account.customerId,
          type: LOYALTY.TRANSACTION_TYPES.EXPIRE,
          points: -toExpire,
          balanceAfter: newBalance,
          source: {
            type: 'expiry',
            id: str(earn._id),
            docNo: earn.source?.docNo ?? null,
          },
          reason: `Points expired from batch ${str(earn._id)}`,
        },
        { session: s },
      );

      const updatedAccount = await repo.updateAccountBalance(
        account._id,
        { delta: -toExpire },
        { session: s },
      );

      return { account: updatedAccount, ledgerEntry, points: toExpire };
    });

    if (expired) {
      expiredCount++;
      totalPointsExpired += expired.points;

      void eventBus.emit(EVENTS.LOYALTY_EXPIRED, {
        customerId: str(earn.customerId),
        points: expired.points,
        balanceAfter: expired.account.pointsBalance,
      });
    }
  }

  return { expiredCount, pointsExpired: totalPointsExpired };
}

/**
 * Returns customer loyalty account summary and recent ledger.
 */
export async function getCustomerLoyaltySummary(customerId) {
  const account = await repo.findAccountByCustomerId(customerId);
  if (!account) throw new NotFoundError('Loyalty account not found');
  const customer = await findCustomerById(customerId);
  return toLoyaltyAccountDto(account, customer);
}

/**
 * Lists ledger transactions for a customer with pagination.
 */
export async function listCustomerLedger(customerId, query = {}) {
  return repo.listLedger({ customerId, ...query });
}
