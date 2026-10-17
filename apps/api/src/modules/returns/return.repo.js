import { ReturnExchange } from './return.model.js';

/** The ONLY place touching the ReturnExchange model. */

export const insertReturnExchange = (data, session) =>
  ReturnExchange.create([data], { session }).then(([d]) => d.toObject());

export const findById = (id, session) =>
  ReturnExchange.findById(id, null, session ? { session } : {}).lean();

export const findByIdempotencyKey = (idempotencyKey) =>
  ReturnExchange.findOne({ idempotencyKey }).lean();

export const listByOrderId = (orderId, session) =>
  ReturnExchange.find({ orderId }, null, session ? { session } : {})
    .sort({ createdAt: 1, _id: 1 })
    .lean();

export async function listReturnExchanges(filter, { sort, skip, limit }) {
  const [items, total] = await Promise.all([
    ReturnExchange.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ReturnExchange.countDocuments(filter),
  ]);
  return { items, total };
}

export const countByBranch = (branchId) => ReturnExchange.countDocuments({ branchId });
