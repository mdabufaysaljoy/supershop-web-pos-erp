import mongoose from 'mongoose';
import { PAYMENT } from '@supershop/shared';

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * Payment (P4.1) — one per attempt to collect an order's money. Financial record: never deleted,
 * never edited by the storefront. The gateway is referenced by `gatewayRef`/`chargeRef` only, so
 * no vendor name reaches the data (CLAUDE.md §3.3).
 */
const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: ObjectId, required: true },
    orderNo: { type: String, required: true },
    /** `cod` or the configured gateway's name. */
    provider: { type: String, required: true },
    /** The method the customer chose (`cod` | `card`). */
    method: { type: String, required: true },
    status: { type: String, required: true, enum: PAYMENT.STATUSES, default: 'pending' },
    amount: { type: Number, required: true },
    refundedAmount: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true },
    /** The gateway's id for the hosted payment page / invoice. */
    gatewayRef: { type: String, default: null },
    /** The captured charge behind it — refunds are made against this. */
    chargeRef: { type: String, default: null },
    redirectUrl: { type: String, default: null },
    failureMessage: { type: String, default: null },
    /** Webhook ids already applied: a gateway may deliver the same event many times. */
    processedEvents: { type: [String], default: [] },
    refunds: {
      type: [
        {
          _id: false,
          refundRef: String,
          amount: Number,
          reason: { type: String, default: null },
          staffId: { type: ObjectId, default: null },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    meta: { type: Mixed, default: () => ({}) },
    paidAt: { type: Date, default: null },
  },
  { collection: 'payments', timestamps: true },
);

paymentSchema.index({ orderId: 1, createdAt: -1 });
paymentSchema.index(
  { gatewayRef: 1 },
  { unique: true, partialFilterExpression: { gatewayRef: { $type: 'string' } } },
);

export const Payment = mongoose.models.Payment ?? mongoose.model('Payment', paymentSchema);
