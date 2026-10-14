import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * Order (P3.4). Everything the shop needs to fulfil and invoice is SNAPSHOTTED here (names,
 * prices, VAT, address): the live catalog may change, history may not. Money in halalas.
 * Financial record: never deleted, never edited in place by the storefront.
 */
const itemSchema = new mongoose.Schema(
  {
    productId: { type: ObjectId, required: true },
    variantId: { type: ObjectId, required: true },
    sku: { type: String, required: true },
    /** Product name as shown to the customer, in the order's language. */
    name: { type: String, required: true },
    /** `[{ name, value }]` option labels, already resolved. */
    options: { type: [{ _id: false, name: String, value: String }], default: [] },
    imageUrl: { type: String, default: null },
    unitPrice: { type: Number, required: true },
    qty: { type: Number, required: true },
    taxCategory: { type: String, default: 'standard' },
    vatRateBps: { type: Number, required: true },
    /** What the customer sees for the line (gross when prices include VAT). */
    lineTotal: { type: Number, required: true },
    net: { type: Number, required: true },
    vat: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true },
    channel: { type: String, required: true, default: 'online' },
    status: { type: String, required: true, default: 'pending' },
    /** Language the order was placed in — receipts and messages use it (§5.7). */
    lang: { type: String, required: true, default: 'en' },
    customer: {
      customerId: { type: ObjectId, default: null },
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: null },
    },
    deliveryMethod: { type: String, required: true, default: 'delivery' },
    address: { type: Mixed, default: null },
    items: { type: [itemSchema], default: [] },
    totals: {
      itemCount: { type: Number, required: true },
      subtotal: { type: Number, required: true },
      deliveryFee: { type: Number, required: true, default: 0 },
      paymentFee: { type: Number, required: true, default: 0 },
      net: { type: Number, required: true },
      vat: { type: Number, required: true },
      total: { type: Number, required: true },
    },
    currency: { type: String, required: true, default: 'SAR' },
    pricesIncludeVat: { type: Boolean, required: true, default: true },
    payment: {
      method: { type: String, required: true },
      /** What checkout must do with it: gateway | cod | offline (snapshot of the method, P4.2). */
      methodType: { type: String, default: 'cod' },
      /** The label the customer saw, in the order's language. */
      label: { type: String, default: null },
      /** What this method added to the total (already inside totals.paymentFee). */
      fee: { type: Number, default: 0 },
      status: { type: String, required: true, default: 'pending' },
      /** The gateway's reference for this order's payment (P4.1); never a vendor-named field. */
      gatewayRef: { type: String, default: null },
      refundedAmount: { type: Number, default: 0 },
    },
    /** Values of admin-defined `checkout` custom fields. */
    customFields: { type: Mixed, default: () => ({}) },
    note: { type: String, default: '' },
    /** Stock taken for this order, per branch (ledger operations). */
    fulfillment: {
      type: [{ _id: false, branchId: ObjectId, operationId: ObjectId, docNo: String }],
      default: [],
    },
    /** Primary branch (most lines) — reports and pick lists start here. */
    branchId: { type: ObjectId, default: null },
    /** Parcels on their way (P4.3). The first one moves the order to `shipped`. */
    shipments: {
      type: [
        {
          _id: false,
          carrier: { type: String, required: true },
          trackingNumber: { type: String, default: null },
          trackingUrl: { type: String, default: null },
          shippedAt: { type: Date, default: Date.now },
          staffId: { type: ObjectId, default: null },
        },
      ],
      default: [],
    },
    /** Every move through the lifecycle, oldest first — who, when, why. */
    statusHistory: {
      type: [
        {
          _id: false,
          at: { type: Date, default: Date.now },
          from: String,
          to: String,
          action: String,
          by: String,
          staffId: { type: ObjectId, default: null },
          reason: { type: String, default: null },
          restocked: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    /** Staff notes (P4.4) — internal, never shown to the customer. */
    notes: {
      type: [
        {
          _id: false,
          at: { type: Date, default: Date.now },
          staffId: { type: ObjectId, default: null },
          staffName: { type: String, default: null },
          text: { type: String, required: true },
        },
      ],
      default: [],
    },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    /** SHA-256 of the link token that shows the confirmation page again. */
    confirmationTokenHash: { type: String, default: null },
    /** `<cart|customer>:<Idempotency-Key>` — a retried checkout returns the first order. */
    idempotencyKey: { type: String, default: null },
    placedAt: { type: Date, required: true },
  },
  { collection: 'orders', timestamps: true, minimize: false },
);
orderSchema.index({ orderNo: 1 }, { unique: true });
orderSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
orderSchema.index({ confirmationTokenHash: 1 });
orderSchema.index({ 'customer.phone': 1, createdAt: -1 });
orderSchema.index({ 'customer.customerId': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// Best-sellers over a window (P5.3) and date-ranged sales reports.
orderSchema.index({ status: 1, placedAt: -1 });
orderSchema.index({ branchId: 1, createdAt: -1 });

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
