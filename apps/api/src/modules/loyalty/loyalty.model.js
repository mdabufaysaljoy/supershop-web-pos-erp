import mongoose from 'mongoose';
import { LOYALTY } from '@supershop/shared';

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

/**
 * Customer Loyalty Account.
 * Tracks current points balance, cumulative earned & redeemed totals, membership tier,
 * and status. Every change is backed by an append-only transaction in LoyaltyLedger.
 */
const loyaltyAccountSchema = new Schema(
  {
    customerId: { type: ObjectId, ref: 'Customer', required: true, unique: true, index: true },
    pointsBalance: { type: Number, default: 0, min: 0 },
    lifetimeEarned: { type: Number, default: 0, min: 0 },
    lifetimeRedeemed: { type: Number, default: 0, min: 0 },
    tier: {
      type: String,
      enum: Object.values(LOYALTY.TIERS),
      default: LOYALTY.TIERS.BRONZE,
    },
    status: {
      type: String,
      enum: Object.values(LOYALTY.MEMBERSHIP_STATUSES),
      default: LOYALTY.MEMBERSHIP_STATUSES.ACTIVE,
    },
  },
  { collection: 'loyalty_accounts', timestamps: true },
);

/**
 * Append-only immutable ledger recording all loyalty point transactions:
 *  - 'earn': awarded on completed/paid order
 *  - 'redeem': used for order discount
 *  - 'reverse': clawed back on customer return/refund
 *  - 'adjust': manual staff grant or debit with reason
 *  - 'expire': automatic forfeiture of expired points
 */
const loyaltyLedgerSchema = new Schema(
  {
    accountId: { type: ObjectId, ref: 'LoyaltyAccount', required: true, index: true },
    customerId: { type: ObjectId, ref: 'Customer', required: true, index: true },
    type: {
      type: String,
      enum: Object.values(LOYALTY.TRANSACTION_TYPES),
      required: true,
      index: true,
    },
    /** Signed integer delta: positive for earn/adjust, negative for redeem/reverse/expire/adjust. */
    points: { type: Number, required: true },
    /** Balance immediately following this transaction. */
    balanceAfter: { type: Number, required: true, min: 0 },
    source: {
      type: {
        type: String,
        enum: ['order', 'return', 'manual', 'expiry'],
        default: 'manual',
      },
      id: { type: String, default: null },
      docNo: { type: String, default: null },
    },
    reason: { type: String, trim: true, default: null },
    /** For earn entries: date at which points expire if not redeemed. */
    expiresAt: { type: Date, default: null, index: true },
    actorId: { type: ObjectId, ref: 'Staff', default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: 'loyalty_ledgers', timestamps: false },
);

// Composite indexes for common query patterns:
loyaltyLedgerSchema.index({ accountId: 1, createdAt: -1 });
loyaltyLedgerSchema.index({ customerId: 1, createdAt: -1 });
loyaltyLedgerSchema.index({ 'source.type': 1, 'source.id': 1 });

// Guard against tampering: append-only ledger cannot be updated or deleted.
for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany']) {
  loyaltyLedgerSchema.pre(hook, function () {
    throw new Error('LoyaltyLedger is append-only; entries cannot be mutated or deleted');
  });
}

export const LoyaltyAccount = mongoose.model('LoyaltyAccount', loyaltyAccountSchema);
export const LoyaltyLedger = mongoose.model('LoyaltyLedger', loyaltyLedgerSchema);
