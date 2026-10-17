import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Shift & ZReport models (P6.5, CLAUDE.md §4).
 *
 * A `Shift` tracks one cashier's drawer session in a branch from opening float to closing count,
 * including paid-in / paid-out cash movements. Closing a shift writes an immutable `ZReport`
 * in the same transaction.
 */
const movementSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['in', 'out'], required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    at: { type: Date, default: Date.now },
    staffId: { type: ObjectId, required: true },
    staffName: { type: String, required: true },
  },
  { _id: true },
);

const shiftSchema = new mongoose.Schema(
  {
    shiftNo: { type: String, required: true },
    branchId: { type: ObjectId, required: true },
    status: { type: String, enum: ['open', 'closed'], required: true, default: 'open' },
    openedBy: { type: ObjectId, required: true },
    openedByName: { type: String, required: true },
    openedAt: { type: Date, required: true },
    openingCash: { type: Number, required: true },
    openNote: { type: String, default: '' },
    movements: { type: [movementSchema], default: [] },
    closedBy: { type: ObjectId, default: null },
    closedByName: { type: String, default: null },
    closedAt: { type: Date, default: null },
    closingCash: { type: Number, default: null },
    expectedCash: { type: Number, default: null },
    discrepancy: { type: Number, default: null },
    closeNote: { type: String, default: '' },
    zReportId: { type: ObjectId, default: null },
    zReportNo: { type: String, default: null },
  },
  { collection: 'shifts', timestamps: true },
);

shiftSchema.index({ shiftNo: 1 }, { unique: true });
// A cashier can only have one open shift at a time.
shiftSchema.index({ openedBy: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
shiftSchema.index({ branchId: 1, status: 1, openedAt: -1 });

const zReportSchema = new mongoose.Schema(
  {
    zReportNo: { type: String, required: true },
    shiftId: { type: ObjectId, required: true },
    shiftNo: { type: String, required: true },
    branchId: { type: ObjectId, required: true },
    openedBy: { type: ObjectId, required: true },
    openedByName: { type: String, required: true },
    closedBy: { type: ObjectId, required: true },
    closedByName: { type: String, required: true },
    openedAt: { type: Date, required: true },
    closedAt: { type: Date, required: true },
    openingCash: { type: Number, required: true },
    closingCash: { type: Number, required: true },
    expectedCash: { type: Number, required: true },
    discrepancy: { type: Number, required: true },
    cashSales: { type: Number, required: true },
    cashIn: { type: Number, required: true },
    cashOut: { type: Number, required: true },
    netCashMovements: { type: Number, required: true },
    sales: {
      count: { type: Number, required: true },
      itemCount: { type: Number, required: true },
      subtotal: { type: Number, required: true },
      discountTotal: { type: Number, required: true },
      net: { type: Number, required: true },
      vat: { type: Number, required: true },
      total: { type: Number, required: true },
    },
    byMethod: {
      type: [
        {
          _id: false,
          method: { type: String, required: true },
          methodType: { type: String, default: 'offline' },
          label: { type: String, required: true },
          count: { type: Number, required: true },
          tendered: { type: Number, required: true },
          changeGiven: { type: Number, required: true },
          netAmount: { type: Number, required: true },
        },
      ],
      default: [],
    },
    movements: {
      type: [
        {
          _id: false,
          type: { type: String, required: true },
          amount: { type: Number, required: true },
          reason: { type: String, required: true },
          at: { type: Date, required: true },
          staffId: { type: ObjectId, required: true },
          staffName: { type: String, required: true },
        },
      ],
      default: [],
    },
    closeNote: { type: String, default: '' },
    currency: { type: String, default: 'SAR' },
  },
  { collection: 'z_reports', timestamps: true },
);

zReportSchema.index({ zReportNo: 1 }, { unique: true });
zReportSchema.index({ shiftId: 1 }, { unique: true });
zReportSchema.index({ branchId: 1, closedAt: -1 });

const immutable = () => {
  throw new Error('ZReport is an immutable financial record and cannot be modified or deleted');
};
zReportSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'],
  immutable,
);

export const Shift = mongoose.models.Shift ?? mongoose.model('Shift', shiftSchema);
export const ZReport = mongoose.models.ZReport ?? mongoose.model('ZReport', zReportSchema);
