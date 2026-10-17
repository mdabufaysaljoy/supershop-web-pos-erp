import { RETURN_EXCHANGE } from '@supershop/shared';
import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * ReturnExchange (P6.6): immutable financial & stock record of a customer return or exchange
 * against an original order.
 */
const returnLineSchema = new mongoose.Schema(
  {
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    sku: { type: String, default: '' },
    name: { type: String, required: true },
    options: { type: [{ _id: false, name: String, value: String }], default: [] },
    imageUrl: { type: String, default: null },
    unitPrice: { type: Number, required: true },
    qty: { type: Number, required: true },
    disposition: {
      type: String,
      enum: RETURN_EXCHANGE.DISPOSITIONS,
      required: true,
      default: 'restock',
    },
    reason: { type: String, default: '' },
    taxCategory: { type: String, default: 'standard' },
    vatRateBps: { type: Number, default: 0 },
    subtotal: { type: Number, required: true },
    discountTotal: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
    net: { type: Number, required: true },
    vat: { type: Number, required: true },
  },
  { _id: false },
);

const exchangeLineSchema = new mongoose.Schema(
  {
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    sku: { type: String, default: '' },
    name: { type: String, required: true },
    options: { type: [{ _id: false, name: String, value: String }], default: [] },
    imageUrl: { type: String, default: null },
    unitPrice: { type: Number, required: true },
    qty: { type: Number, required: true },
    taxCategory: { type: String, default: 'standard' },
    vatRateBps: { type: Number, default: 0 },
    discount: { type: Mixed, default: null },
    discountTotal: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
    net: { type: Number, required: true },
    vat: { type: Number, required: true },
  },
  { _id: false },
);

const totalsSchema = new mongoose.Schema(
  {
    itemCount: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    discountTotal: { type: Number, default: 0 },
    net: { type: Number, required: true },
    vat: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const returnExchangeSchema = new mongoose.Schema(
  {
    returnNo: { type: String, required: true, unique: true },
    type: { type: String, enum: RETURN_EXCHANGE.TYPES, required: true },
    orderId: { type: ObjectId, required: true, index: true },
    orderNo: { type: String, required: true, index: true },
    channel: { type: String, default: 'pos' },
    branchId: { type: ObjectId, required: true, index: true },
    shiftId: { type: ObjectId, default: null },
    customer: {
      customerId: { type: ObjectId, default: null },
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: null },
    },
    returnLines: { type: [returnLineSchema], default: [] },
    returnTotals: { type: totalsSchema, required: true },
    exchangeLines: { type: [exchangeLineSchema], default: [] },
    exchangeTotals: { type: totalsSchema, default: null },
    refundMethod: { type: String, default: null },
    refundAmount: { type: Number, default: 0 },
    differenceDue: { type: Number, default: 0 },
    payments: {
      type: [
        {
          _id: false,
          method: { type: String, required: true },
          methodType: { type: String, default: 'offline' },
          label: { type: String, default: null },
          amount: { type: Number, required: true },
          reference: { type: String, default: null },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    changeGiven: { type: Number, default: 0 },
    stockOperations: {
      type: [
        new mongoose.Schema(
          {
            branchId: { type: ObjectId },
            operationId: { type: ObjectId },
            type: { type: String },
            docNo: { type: String },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    staffId: { type: ObjectId, default: null },
    reason: { type: String, default: '' },
    note: { type: String, default: '' },
    idempotencyKey: { type: String, default: null },
  },
  { collection: 'return_exchanges', timestamps: true, minimize: false },
);

returnExchangeSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
returnExchangeSchema.index({ branchId: 1, createdAt: -1 });
returnExchangeSchema.index({ orderId: 1, createdAt: 1 });

const forbidDelete = function forbid() {
  throw new Error('ReturnExchange records are immutable and cannot be deleted');
};
returnExchangeSchema.pre('deleteOne', forbidDelete);
returnExchangeSchema.pre('deleteMany', forbidDelete);
returnExchangeSchema.pre('findOneAndDelete', forbidDelete);

export const ReturnExchange =
  mongoose.models.ReturnExchange ?? mongoose.model('ReturnExchange', returnExchangeSchema);
