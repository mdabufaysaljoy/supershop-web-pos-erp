import { Order } from './order.model.js';

/** The ONLY place touching the order model. */

export const insertOrder = (data, session) =>
  Order.create([data], { session }).then(([d]) => d.toObject());
export const findById = (id) => Order.findById(id).lean();
export const findByNumber = (orderNo) => Order.findOne({ orderNo }).lean();
export const findByIdempotencyKey = (idempotencyKey) => Order.findOne({ idempotencyKey }).lean();
export const findByConfirmationToken = (confirmationTokenHash) =>
  Order.findOne({ confirmationTokenHash }).lean();
/** Tracking (P3.6): the order must match both number and phone. */
export const findForTracking = (orderNo, phone) =>
  Order.findOne({ orderNo, 'customer.phone': phone }).lean();

// ------------------------------------------------------------- P3.5 order history

/** The customer's own orders, newest first. */
export const listByCustomer = (customerId, { skip, limit }) =>
  Order.find({ 'customer.customerId': customerId })
    .sort({ placedAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

export const countByCustomer = (customerId) =>
  Order.countDocuments({ 'customer.customerId': customerId });

export const findByIdForCustomer = (id, customerId) =>
  Order.findOne({ _id: id, 'customer.customerId': customerId }).lean();

/**
 * Attaches guest orders to a customer once that email is PROVEN to be theirs (verification or an
 * identity provider) — never on sign-in alone, or anyone could claim a stranger's history.
 * @returns {Promise<number>} orders linked
 */
export const linkGuestOrdersByEmail = async (email, customerId) =>
  (
    await Order.updateMany(
      { 'customer.email': email, 'customer.customerId': null },
      { $set: { 'customer.customerId': customerId } },
    )
  ).modifiedCount;
