import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Stock (CLAUDE.md §2.5 "Stock = append-only ledger"):
 * - `StockMovement`  one ledger row per variant per branch per operation. NEVER updated or deleted.
 * - `StockLevel`     cached quantity on hand per (variant, branch). Changed ONLY by an atomic `$inc`
 *                    in the same transaction that inserts the movement (`balanceAfter`).
 * - `StockOperation` the document (adjustment, transfer, receipt, sale, return) grouping movements:
 *                    who, why, document number, idempotency key.
 */

const levelSchema = new mongoose.Schema(
  {
    variantId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    branchId: { type: ObjectId, required: true },
    onHand: { type: Number, required: true, default: 0 },
    /** null = store default (`inventory.lowStockThreshold`). */
    lowStockThreshold: { type: Number, default: null },
    lastMovementAt: { type: Date, default: null },
  },
  { collection: 'stock_levels', timestamps: true },
);
levelSchema.index({ variantId: 1, branchId: 1 }, { unique: true });
levelSchema.index({ branchId: 1, onHand: 1 });
levelSchema.index({ productId: 1, branchId: 1 });

const operationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    /** Human document number (ADJ-000042) for manual operations; sales/returns use their order's. */
    docNo: { type: String, default: null },
    branchId: { type: ObjectId, required: true },
    /** Transfers: destination branch. */
    toBranchId: { type: ObjectId, default: null },
    reason: { type: String, default: null },
    note: { type: String, default: '' },
    /** Receipts: supplier delivery note / invoice number. */
    reference: { type: String, default: null },
    supplierId: { type: ObjectId, default: null },
    /** Source document in another module (e.g. `order`, `purchaseOrder`). */
    refType: { type: String, default: null },
    refId: { type: ObjectId, default: null },
    lineCount: { type: Number, required: true },
    actorId: { type: ObjectId, default: null },
    /** `<actorId>:<Idempotency-Key>` — a retried request returns the first result. */
    idempotencyKey: { type: String, default: null },
  },
  { collection: 'stock_operations', timestamps: { createdAt: true, updatedAt: false } },
);
operationSchema.index(
  { docNo: 1 },
  { unique: true, partialFilterExpression: { docNo: { $type: 'string' } } },
);
operationSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
operationSchema.index({ branchId: 1, createdAt: -1 });
operationSchema.index({ toBranchId: 1, createdAt: -1 });
operationSchema.index({ refType: 1, refId: 1 });

const movementSchema = new mongoose.Schema(
  {
    operationId: { type: ObjectId, required: true },
    type: { type: String, required: true },
    variantId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    branchId: { type: ObjectId, required: true },
    /** Signed change of the branch's quantity on hand. */
    delta: { type: Number, required: true },
    /** Quantity on hand right after this row (running balance). */
    balanceAfter: { type: Number, required: true },
    /** Stock counts: the quantity counted. */
    countedQty: { type: Number, default: null },
    /** Receipts: cost per unit in halalas (sensitive: product.viewCost). */
    unitCost: { type: Number, default: null },
    actorId: { type: ObjectId, default: null },
  },
  { collection: 'stock_movements', timestamps: { createdAt: true, updatedAt: false } },
);
movementSchema.index({ branchId: 1, createdAt: -1 });
movementSchema.index({ variantId: 1, branchId: 1, createdAt: -1 });
movementSchema.index({ productId: 1, createdAt: -1 });
movementSchema.index({ operationId: 1 });

// Append-only: the ledger can't be rewritten through the models.
const appendOnly = () => {
  throw new Error('Stock movements are append-only');
};
movementSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  appendOnly,
);

export const StockLevel = mongoose.models.StockLevel ?? mongoose.model('StockLevel', levelSchema);
export const StockOperation =
  mongoose.models.StockOperation ?? mongoose.model('StockOperation', operationSchema);
export const StockMovement =
  mongoose.models.StockMovement ?? mongoose.model('StockMovement', movementSchema);
