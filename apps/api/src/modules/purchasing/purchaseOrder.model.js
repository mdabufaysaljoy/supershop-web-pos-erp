import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Purchase order (P2.3). Lines are keyed by variant (one line per variant). Money in halalas,
 * excluding VAT. A purchasing record: never deleted (cancel instead).
 */
const lineSchema = new mongoose.Schema(
  {
    variantId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    qtyOrdered: { type: Number, required: true },
    qtyReceived: { type: Number, required: true, default: 0 },
    unitCost: { type: Number, required: true },
  },
  { _id: false },
);

const receiptSchema = new mongoose.Schema(
  {
    operationId: { type: ObjectId, required: true },
    docNo: { type: String, required: true },
    reference: { type: String, default: null },
    units: { type: Number, required: true },
    value: { type: Number, required: true },
    actorId: { type: ObjectId, default: null },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNo: { type: String, required: true },
    status: { type: String, required: true, default: 'draft' },
    supplierId: { type: ObjectId, required: true },
    /** Snapshot: the PO keeps its supplier name even if the supplier is renamed/deleted. */
    supplierName: { type: String, required: true },
    branchId: { type: ObjectId, required: true },
    /** Expected delivery (store-local date `YYYY-MM-DD`). */
    expectedAt: { type: String, default: null },
    /** Supplier's order/quote number. */
    reference: { type: String, default: null },
    note: { type: String, default: '' },
    lines: { type: [lineSchema], default: [] },
    /** Denormalized totals (halalas / units) for lists. */
    totalOrdered: { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },
    receipts: { type: [receiptSchema], default: [] },
    orderedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    createdBy: { type: ObjectId, default: null },
  },
  { collection: 'purchase_orders', timestamps: true, minimize: false },
);
purchaseOrderSchema.index({ poNo: 1 }, { unique: true });
purchaseOrderSchema.index({ branchId: 1, createdAt: -1 });
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

export const PurchaseOrder =
  mongoose.models.PurchaseOrder ?? mongoose.model('PurchaseOrder', purchaseOrderSchema);
