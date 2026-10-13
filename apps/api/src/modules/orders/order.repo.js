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
