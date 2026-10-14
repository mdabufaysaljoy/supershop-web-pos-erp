import { Payment } from './payment.model.js';

/** The ONLY place touching the payment model. */

export const insertPayment = (data) => Payment.create(data).then((d) => d.toObject());
export const findById = (id) => Payment.findById(id).lean();
export const findByGatewayRef = (gatewayRef) => Payment.findOne({ gatewayRef }).lean();
export const findLatestForOrder = (orderId) =>
  Payment.findOne({ orderId }).sort({ createdAt: -1 }).lean();
export const listForOrder = (orderId) => Payment.find({ orderId }).sort({ createdAt: 1 }).lean();

/**
 * Applies a gateway outcome once: the event id is added only if it was not there before, so a
 * webhook delivered twice updates nothing the second time.
 * @returns {Promise<object | null>} the updated payment, or null when the event was already applied
 */
export const applyEvent = (id, eventId, patch) =>
  Payment.findOneAndUpdate(
    { _id: id, ...(eventId ? { processedEvents: { $ne: eventId } } : {}) },
    { $set: patch, ...(eventId ? { $push: { processedEvents: eventId } } : {}) },
    { returnDocument: 'after' },
  ).lean();

export const addRefund = (id, refund, { status, refundedAmount }) =>
  Payment.findOneAndUpdate(
    { _id: id },
    { $set: { status, refundedAmount }, $push: { refunds: refund } },
    { returnDocument: 'after' },
  ).lean();
