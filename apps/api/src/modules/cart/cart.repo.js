import { Cart } from './cart.model.js';

/** The ONLY place touching the cart model. */

export const findByTokenHash = (tokenHash) => Cart.findOne({ tokenHash }).lean();
export const findByCustomer = (customerId) => Cart.findOne({ customerId }).lean();
export const createCart = (data) => Cart.create(data).then((d) => d.toObject());
export const deleteById = (id) => Cart.deleteOne({ _id: id });

/** Writes the line set if nobody changed the cart since `rev` was read; null on conflict. */
export const replaceItems = (id, rev, items, set = {}) =>
  Cart.findOneAndUpdate(
    { _id: id, rev },
    { $set: { items, ...set }, $inc: { rev: 1 } },
    { returnDocument: 'after', lean: true },
  );

/** A guest cart becomes the customer's cart (no TTL, no token). */
export const attachToCustomer = (id, customerId) =>
  Cart.findOneAndUpdate(
    { _id: id, customerId: null },
    { $set: { customerId, tokenHash: null, expiresAt: null }, $inc: { rev: 1 } },
    { returnDocument: 'after', lean: true },
  );
