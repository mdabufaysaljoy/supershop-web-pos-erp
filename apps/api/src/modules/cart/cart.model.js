import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Storefront cart (P3.2). A guest cart is identified by a random token kept in an httpOnly
 * cookie (only its SHA-256 is stored); a customer cart by `customerId` (one per customer).
 * Lines hold quantities only — prices, VAT and stock are recomputed from the catalog on every
 * read. `unitPriceSeen` is the last price shown, to tell the shopper when it changed.
 * `rev` guards concurrent writes (two tabs): writes match the revision they read.
 */
const itemSchema = new mongoose.Schema(
  {
    variantId: { type: ObjectId, required: true },
    productId: { type: ObjectId, required: true },
    qty: { type: Number, required: true },
    unitPriceSeen: { type: Number, default: null },
    addedAt: { type: Date, required: true },
  },
  { _id: false },
);

const cartSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, default: null },
    customerId: { type: ObjectId, default: null },
    items: { type: [itemSchema], default: [] },
    rev: { type: Number, default: 0 },
    /** Guests: removed automatically after inactivity (TTL index). Customers: null (kept). */
    expiresAt: { type: Date, default: null },
  },
  { collection: 'carts', timestamps: true, minimize: false },
);
cartSchema.index(
  { tokenHash: 1 },
  { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } },
);
cartSchema.index(
  { customerId: 1 },
  { unique: true, partialFilterExpression: { customerId: { $type: 'objectId' } } },
);
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Cart = mongoose.models.Cart ?? mongoose.model('Cart', cartSchema);
