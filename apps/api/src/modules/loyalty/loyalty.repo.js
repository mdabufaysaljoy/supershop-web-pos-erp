import mongoose from 'mongoose';
import { LoyaltyAccount, LoyaltyLedger } from './loyalty.model.js';

const oid = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

export const findAccountByCustomerId = (customerId, { session } = {}) =>
  LoyaltyAccount.findOne({ customerId: oid(customerId) })
    .session(session ?? null)
    .lean();

export const findAccountById = (id, { session } = {}) =>
  LoyaltyAccount.findById(oid(id))
    .session(session ?? null)
    .lean();

export const createAccount = async (data, { session } = {}) => {
  const [created] = await LoyaltyAccount.create([data], { session, ordered: true });
  return created.toObject();
};

export const updateAccountBalance = async (
  accountId,
  { delta = 0, lifetimeEarnedDelta = 0, lifetimeRedeemedDelta = 0, tier = null },
  { session } = {},
) => {
  const query = { _id: oid(accountId) };
  if (delta < 0) {
    query.pointsBalance = { $gte: -delta };
  }

  const update = {
    $inc: {
      pointsBalance: delta,
      ...(lifetimeEarnedDelta !== 0 && { lifetimeEarned: lifetimeEarnedDelta }),
      ...(lifetimeRedeemedDelta !== 0 && { lifetimeRedeemed: lifetimeRedeemedDelta }),
    },
  };
  if (tier) {
    update.$set = { tier };
  }

  return LoyaltyAccount.findOneAndUpdate(query, update, {
    returnDocument: 'after',
    session: session ?? null,
  }).lean();
};

export const insertLedgerEntry = async (entry, { session } = {}) => {
  const [created] = await LoyaltyLedger.create([entry], { session, ordered: true });
  return created.toObject();
};

export const findLedgerBySource = (sourceType, sourceId, { session } = {}) =>
  LoyaltyLedger.findOne({ 'source.type': sourceType, 'source.id': String(sourceId) })
    .session(session ?? null)
    .lean();

export async function listLedger({
  customerId = null,
  accountId = null,
  type = null,
  fromDate = null,
  toDate = null,
  page = 1,
  limit = 20,
}) {
  const filter = {};
  if (customerId) filter.customerId = oid(customerId);
  if (accountId) filter.accountId = oid(accountId);
  if (type) filter.type = type;

  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    LoyaltyLedger.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LoyaltyLedger.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  };
}

export const findEarnEntriesEligibleForExpiry = (now = new Date(), { limit = 100 } = {}) =>
  LoyaltyLedger.find({
    type: 'earn',
    expiresAt: { $ne: null, $lte: now },
  })
    .sort({ expiresAt: 1 })
    .limit(limit)
    .lean();
