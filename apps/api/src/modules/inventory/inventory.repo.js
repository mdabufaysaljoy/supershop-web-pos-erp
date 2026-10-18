import { StockLevel, StockMovement, StockOperation } from './stock.model.js';

/** The ONLY place touching the stock models. Writes take the caller's transaction `session`. */

// ---------- writes (inside a transaction) ----------

export const insertOperation = (data, session) =>
  StockOperation.create([data], { session }).then(([d]) => d.toObject());

/**
 * Atomic change of a level. Increases (and zero) create the level if missing. Decreases only
 * match while enough is on hand (unless `allowNegative`) → `null` = insufficient.
 */
export function changeLevel({ variantId, productId, branchId, delta, allowNegative, at }, session) {
  const decrease = delta < 0;
  return StockLevel.findOneAndUpdate(
    {
      variantId,
      branchId,
      ...(decrease && !allowNegative && { onHand: { $gte: -delta } }),
    },
    {
      $inc: { onHand: delta },
      $set: { lastMovementAt: at },
      $setOnInsert: { productId, lowStockThreshold: null },
    },
    { upsert: !decrease, returnDocument: 'after', session, lean: true },
  );
}

export const insertMovements = (docs, session) =>
  StockMovement.insertMany(docs, { session, ordered: true });

export const setThreshold = ({ variantId, productId, branchId, lowStockThreshold }) =>
  StockLevel.findOneAndUpdate(
    { variantId, branchId },
    {
      $set: { lowStockThreshold },
      $setOnInsert: { productId, onHand: 0, lastMovementAt: null },
    },
    { upsert: true, returnDocument: 'after', lean: true },
  );

// ---------- reads ----------

const opts = (session) => (session ? { session } : {});

export const findLevel = (variantId, branchId, session) =>
  StockLevel.findOne({ variantId, branchId }, null, opts(session)).lean();
export const findLevels = (filter, session) => StockLevel.find(filter, null, opts(session)).lean();

export async function listLevels(filter, { sort, skip, limit }) {
  const [items, total] = await Promise.all([
    StockLevel.find(filter)
      .sort({ ...sort, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockLevel.countDocuments(filter),
  ]);
  return { items, total };
}

export async function listMovements(filter, { sort, skip, limit }) {
  const [items, total] = await Promise.all([
    StockMovement.find(filter)
      .sort({ ...sort, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockMovement.countDocuments(filter),
  ]);
  return { items, total };
}
export const movementsOf = (operationId, session) =>
  StockMovement.find({ operationId }, null, opts(session)).sort({ _id: 1 }).lean();

export async function listOperations(filter, { sort, skip, limit }) {
  const [items, total] = await Promise.all([
    StockOperation.find(filter)
      .sort({ ...sort, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StockOperation.countDocuments(filter),
  ]);
  return { items, total };
}
export const findOperation = (id) => StockOperation.findById(id).lean();
export const findOperationByKey = (idempotencyKey) =>
  StockOperation.findOne({ idempotencyKey }).lean();
export const findOperationsByIds = (ids) =>
  StockOperation.find({ _id: { $in: ids } }, { docNo: 1, type: 1, reason: 1 }).lean();

export const sumOnHand = (variantIds, session) =>
  StockLevel.aggregate(
    [
      { $match: { variantId: { $in: variantIds } } },
      { $group: { _id: '$variantId', onHand: { $sum: '$onHand' } } },
    ],
    { session },
  );

/** Variant ids with stock on hand in any of `branchIds`. */
export const variantsInStock = (variantIds, branchIds) =>
  StockLevel.distinct('variantId', {
    variantId: { $in: variantIds },
    branchId: { $in: branchIds },
    onHand: { $gt: 0 },
  });

/** On hand per variant summed over `branchIds` (only positive levels). */
export const sumOnHandIn = (variantIds, branchIds) =>
  StockLevel.aggregate([
    {
      $match: { variantId: { $in: variantIds }, branchId: { $in: branchIds }, onHand: { $gt: 0 } },
    },
    { $group: { _id: '$variantId', onHand: { $sum: '$onHand' } } },
  ]);

/** Positive levels of these variants in these branches (allocation across branches). */
export const levelsIn = (variantIds, branchIds, session) =>
  StockLevel.find(
    { variantId: { $in: variantIds }, branchId: { $in: branchIds }, onHand: { $gt: 0 } },
    { variantId: 1, branchId: 1, onHand: 1 },
    opts(session),
  ).lean();

/** Anything recorded for a branch (blocks deleting it). */
export const countBranchRecords = async (branchId) =>
  (await StockOperation.countDocuments({ $or: [{ branchId }, { toBranchId: branchId }] })) +
  (await StockLevel.countDocuments({ branchId }));

/** Count low stock and out of stock items for inventory health KPIs. */
export async function countStockHealth(branchFilter = {}, fallbackThreshold = 5) {
  const [lowStockCount, outOfStockCount] = await Promise.all([
    StockLevel.countDocuments({
      ...branchFilter,
      onHand: { $gt: 0 },
      $expr: { $lte: ['$onHand', { $ifNull: ['$lowStockThreshold', fallbackThreshold] }] },
    }),
    StockLevel.countDocuments({
      ...branchFilter,
      onHand: { $lte: 0 },
    }),
  ]);
  return { lowStockCount, outOfStockCount };
}

/**
 * Summary of stock levels for stockout prediction (P8.3).
 */
export async function getStockLevelsSummary(branchId = null) {
  if (branchId) {
    const rows = await StockLevel.find({ branchId }).lean();
    return rows.map((r) => ({
      variantId: String(r.variantId),
      productId: String(r.productId),
      branchId: String(r.branchId),
      onHand: r.onHand ?? 0,
      lowStockThreshold: r.lowStockThreshold ?? null,
    }));
  }

  const rows = await StockLevel.aggregate([
    {
      $group: {
        _id: '$variantId',
        productId: { $first: '$productId' },
        onHand: { $sum: '$onHand' },
        lowStockThreshold: { $min: '$lowStockThreshold' },
      },
    },
  ]);

  return rows.map((r) => ({
    variantId: String(r._id),
    productId: String(r.productId),
    branchId: null,
    onHand: r.onHand ?? 0,
    lowStockThreshold: r.lowStockThreshold ?? null,
  }));
}
