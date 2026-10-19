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

/**
 * Returns overall totals for return/exchange records matching a filter.
 */
export async function getReturnExchangeAggregate(matchFilter) {
  const [row] = await ReturnExchange.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        returnsCount: {
          $sum: { $cond: [{ $eq: ['$type', 'return'] }, 1, 0] },
        },
        exchangesCount: {
          $sum: { $cond: [{ $eq: ['$type', 'exchange'] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
        refundAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
        differenceDue: { $sum: { $ifNull: ['$differenceDue', 0] } },
        returnedUnits: { $sum: { $ifNull: ['$returnTotals.itemCount', 0] } },
        exchangedUnits: { $sum: { $ifNull: ['$exchangeTotals.itemCount', 0] } },
      },
    },
  ]);

  return {
    returnsCount: row?.returnsCount ?? 0,
    exchangesCount: row?.exchangesCount ?? 0,
    totalCount: row?.totalCount ?? 0,
    refundAmount: row?.refundAmount ?? 0,
    differenceDue: row?.differenceDue ?? 0,
    returnedUnits: row?.returnedUnits ?? 0,
    exchangedUnits: row?.exchangedUnits ?? 0,
  };
}

/**
 * Returns return/exchange stats grouped by channel.
 */
export async function getReturnChannelBreakdown(matchFilter) {
  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$channel',
        returnsCount: {
          $sum: { $cond: [{ $eq: ['$type', 'return'] }, 1, 0] },
        },
        exchangesCount: {
          $sum: { $cond: [{ $eq: ['$type', 'exchange'] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
        refundAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
        differenceDue: { $sum: { $ifNull: ['$differenceDue', 0] } },
        returnedUnits: { $sum: { $ifNull: ['$returnTotals.itemCount', 0] } },
        exchangedUnits: { $sum: { $ifNull: ['$exchangeTotals.itemCount', 0] } },
      },
    },
  ]);

  const result = {
    pos: {
      returnsCount: 0,
      exchangesCount: 0,
      totalCount: 0,
      refundAmount: 0,
      differenceDue: 0,
      returnedUnits: 0,
      exchangedUnits: 0,
    },
    online: {
      returnsCount: 0,
      exchangesCount: 0,
      totalCount: 0,
      refundAmount: 0,
      differenceDue: 0,
      returnedUnits: 0,
      exchangedUnits: 0,
    },
  };

  for (const r of rows) {
    const ch = r._id === 'online' ? 'online' : 'pos';
    result[ch] = {
      returnsCount: r.returnsCount ?? 0,
      exchangesCount: r.exchangesCount ?? 0,
      totalCount: r.totalCount ?? 0,
      refundAmount: r.refundAmount ?? 0,
      differenceDue: r.differenceDue ?? 0,
      returnedUnits: r.returnedUnits ?? 0,
      exchangedUnits: r.exchangedUnits ?? 0,
    };
  }

  return result;
}

/**
 * Returns recent return/exchange transactions for dashboard overview.
 */
export async function getRecentReturns(matchFilter, limit = 5) {
  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'branches',
        localField: 'branchId',
        foreignField: '_id',
        as: 'branchDoc',
      },
    },
    { $unwind: { path: '$branchDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'staff',
        localField: 'staffId',
        foreignField: '_id',
        as: 'staffDoc',
      },
    },
    { $unwind: { path: '$staffDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        returnNo: 1,
        orderNo: 1,
        type: 1,
        channel: 1,
        customerName: '$customer.name',
        customerPhone: '$customer.phone',
        refundAmount: 1,
        differenceDue: 1,
        returnedUnits: '$returnTotals.itemCount',
        exchangedUnits: '$exchangeTotals.itemCount',
        branchName: '$branchDoc.name.en',
        staffName: '$staffDoc.name',
        createdAt: 1,
      },
    },
  ]);

  return rows.map((r) => ({
    id: String(r._id),
    returnNo: r.returnNo,
    orderNo: r.orderNo,
    type: r.type,
    channel: r.channel,
    customerName: r.customerName || null,
    customerPhone: r.customerPhone || null,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: r.differenceDue ?? 0,
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: r.exchangedUnits ?? 0,
    branchName: r.branchName || null,
    staffName: r.staffName || null,
    createdAt: r.createdAt,
  }));
}

/**
 * Returns detailed return & exchange transactions (dimension: 'all').
 */
export async function getReturnStatsAll(
  matchFilter,
  { limit = 50, sortBy = 'refundAmount', sortDir = 'desc' } = {},
) {
  const sortDirection = sortDir === 'asc' ? 1 : -1;
  const sortFieldMap = {
    refundAmount: 'refundAmount',
    differenceDue: 'differenceDue',
    returnedUnits: 'returnTotals.itemCount',
    exchangedUnits: 'exchangeTotals.itemCount',
    returnsCount: 'refundAmount',
    name: 'returnNo',
  };
  const primarySort = sortFieldMap[sortBy] ?? 'refundAmount';

  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    {
      $lookup: {
        from: 'branches',
        localField: 'branchId',
        foreignField: '_id',
        as: 'branchDoc',
      },
    },
    { $unwind: { path: '$branchDoc', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'staff',
        localField: 'staffId',
        foreignField: '_id',
        as: 'staffDoc',
      },
    },
    { $unwind: { path: '$staffDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        returnNo: 1,
        orderNo: 1,
        type: 1,
        channel: 1,
        customerName: '$customer.name',
        customerPhone: '$customer.phone',
        refundAmount: 1,
        differenceDue: 1,
        returnedUnits: { $ifNull: ['$returnTotals.itemCount', 0] },
        exchangedUnits: { $ifNull: ['$exchangeTotals.itemCount', 0] },
        branchName: { $ifNull: ['$branchDoc.name.en', 'HQ / Unassigned'] },
        branchCode: '$branchDoc.code',
        staffName: { $ifNull: ['$staffDoc.name', 'Online / System'] },
        reason: 1,
        createdAt: 1,
      },
    },
    { $sort: { [primarySort]: sortDirection, createdAt: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: String(r._id),
    name: r.returnNo,
    orderNo: r.orderNo,
    type: r.type,
    channel: r.channel,
    customerName: r.customerName || null,
    customerPhone: r.customerPhone || null,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: r.differenceDue ?? 0,
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: r.exchangedUnits ?? 0,
    branchName: r.branchName,
    branchCode: r.branchCode ?? null,
    staffName: r.staffName,
    reason: r.reason ?? null,
    returnsCount: r.type === 'return' ? 1 : 0,
    exchangesCount: r.type === 'exchange' ? 1 : 0,
    totalCount: 1,
    createdAt: r.createdAt,
  }));
}

/**
 * Returns return and exchange statistics grouped by product.
 */
export async function getReturnStatsByProduct(
  matchFilter,
  { limit = 50, sortBy = 'refundAmount', sortDir = 'desc' } = {},
) {
  const sortDirection = sortDir === 'asc' ? 1 : -1;
  const sortFieldMap = {
    refundAmount: 'refundAmount',
    returnedUnits: 'returnedUnits',
    returnsCount: 'returnsCount',
    exchangesCount: 'exchangesCount',
    totalCount: 'totalCount',
    name: 'name',
    differenceDue: 'refundAmount',
  };
  const primarySort = sortFieldMap[sortBy] ?? 'refundAmount';

  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    { $unwind: '$returnLines' },
    {
      $group: {
        _id: '$returnLines.productId',
        name: { $first: '$returnLines.name' },
        sku: { $first: '$returnLines.sku' },
        imageUrl: { $first: '$returnLines.imageUrl' },
        returnedUnits: { $sum: '$returnLines.qty' },
        refundAmount: { $sum: '$returnLines.lineTotal' },
        returnsCountList: {
          $addToSet: {
            $cond: [{ $eq: ['$type', 'return'] }, '$_id', null],
          },
        },
        exchangesCountList: {
          $addToSet: {
            $cond: [{ $eq: ['$type', 'exchange'] }, '$_id', null],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        sku: 1,
        imageUrl: 1,
        returnedUnits: 1,
        refundAmount: 1,
        returnsCount: {
          $size: {
            $filter: {
              input: '$returnsCountList',
              as: 'id',
              cond: { $ne: ['$$id', null] },
            },
          },
        },
        exchangesCount: {
          $size: {
            $filter: {
              input: '$exchangesCountList',
              as: 'id',
              cond: { $ne: ['$$id', null] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalCount: { $add: ['$returnsCount', '$exchangesCount'] },
        differenceDue: 0,
      },
    },
    { $sort: { [primarySort]: sortDirection, refundAmount: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: String(r._id),
    name: r.name,
    sku: r.sku ?? '',
    imageUrl: r.imageUrl ?? null,
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: 0,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: 0,
    returnsCount: r.returnsCount ?? 0,
    exchangesCount: r.exchangesCount ?? 0,
    totalCount: r.totalCount ?? 0,
  }));
}

/**
 * Returns return and exchange statistics grouped by category.
 */
export async function getReturnStatsByCategory(
  matchFilter,
  { limit = 50, sortBy = 'refundAmount', sortDir = 'desc' } = {},
) {
  const sortDirection = sortDir === 'asc' ? 1 : -1;
  const sortFieldMap = {
    refundAmount: 'refundAmount',
    returnedUnits: 'returnedUnits',
    returnsCount: 'returnsCount',
    exchangesCount: 'exchangesCount',
    totalCount: 'totalCount',
    name: 'name',
    differenceDue: 'refundAmount',
  };
  const primarySort = sortFieldMap[sortBy] ?? 'refundAmount';

  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    { $unwind: '$returnLines' },
    {
      $lookup: {
        from: 'products',
        localField: 'returnLines.productId',
        foreignField: '_id',
        as: 'productDoc',
      },
    },
    { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$productDoc.categoryIds', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$productDoc.categoryIds',
        returnedUnits: { $sum: '$returnLines.qty' },
        refundAmount: { $sum: '$returnLines.lineTotal' },
        returnsCountList: {
          $addToSet: {
            $cond: [{ $eq: ['$type', 'return'] }, '$_id', null],
          },
        },
        exchangesCountList: {
          $addToSet: {
            $cond: [{ $eq: ['$type', 'exchange'] }, '$_id', null],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'catDoc',
      },
    },
    { $unwind: { path: '$catDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: { $ifNull: ['$catDoc.name.en', 'Uncategorized'] },
        slug: '$catDoc.slug',
        returnedUnits: 1,
        refundAmount: 1,
        returnsCount: {
          $size: {
            $filter: {
              input: '$returnsCountList',
              as: 'id',
              cond: { $ne: ['$$id', null] },
            },
          },
        },
        exchangesCount: {
          $size: {
            $filter: {
              input: '$exchangesCountList',
              as: 'id',
              cond: { $ne: ['$$id', null] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        totalCount: { $add: ['$returnsCount', '$exchangesCount'] },
        differenceDue: 0,
      },
    },
    { $sort: { [primarySort]: sortDirection, refundAmount: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    slug: r.slug ?? '',
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: 0,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: 0,
    returnsCount: r.returnsCount ?? 0,
    exchangesCount: r.exchangesCount ?? 0,
    totalCount: r.totalCount ?? 0,
  }));
}

/**
 * Returns return and exchange statistics grouped by staff member.
 */
export async function getReturnStatsByStaff(
  matchFilter,
  { limit = 50, sortBy = 'refundAmount', sortDir = 'desc' } = {},
) {
  const sortDirection = sortDir === 'asc' ? 1 : -1;
  const sortFieldMap = {
    refundAmount: 'refundAmount',
    differenceDue: 'differenceDue',
    returnedUnits: 'returnedUnits',
    exchangedUnits: 'exchangedUnits',
    returnsCount: 'returnsCount',
    exchangesCount: 'exchangesCount',
    totalCount: 'totalCount',
    name: 'name',
  };
  const primarySort = sortFieldMap[sortBy] ?? 'refundAmount';

  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$staffId',
        returnsCount: {
          $sum: { $cond: [{ $eq: ['$type', 'return'] }, 1, 0] },
        },
        exchangesCount: {
          $sum: { $cond: [{ $eq: ['$type', 'exchange'] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
        refundAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
        differenceDue: { $sum: { $ifNull: ['$differenceDue', 0] } },
        returnedUnits: { $sum: { $ifNull: ['$returnTotals.itemCount', 0] } },
        exchangedUnits: { $sum: { $ifNull: ['$exchangeTotals.itemCount', 0] } },
      },
    },
    {
      $lookup: {
        from: 'staff',
        localField: '_id',
        foreignField: '_id',
        as: 'staffDoc',
      },
    },
    { $unwind: { path: '$staffDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: { $ifNull: ['$staffDoc.name', 'Online / System'] },
        email: '$staffDoc.email',
        returnsCount: 1,
        exchangesCount: 1,
        totalCount: 1,
        refundAmount: 1,
        differenceDue: 1,
        returnedUnits: 1,
        exchangedUnits: 1,
      },
    },
    { $sort: { [primarySort]: sortDirection, refundAmount: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    email: r.email ?? null,
    returnsCount: r.returnsCount ?? 0,
    exchangesCount: r.exchangesCount ?? 0,
    totalCount: r.totalCount ?? 0,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: r.differenceDue ?? 0,
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: r.exchangedUnits ?? 0,
  }));
}

/**
 * Returns return and exchange statistics grouped by branch.
 */
export async function getReturnStatsByBranch(
  matchFilter,
  { limit = 50, sortBy = 'refundAmount', sortDir = 'desc' } = {},
) {
  const sortDirection = sortDir === 'asc' ? 1 : -1;
  const sortFieldMap = {
    refundAmount: 'refundAmount',
    differenceDue: 'differenceDue',
    returnedUnits: 'returnedUnits',
    exchangedUnits: 'exchangedUnits',
    returnsCount: 'returnsCount',
    exchangesCount: 'exchangesCount',
    totalCount: 'totalCount',
    name: 'name',
  };
  const primarySort = sortFieldMap[sortBy] ?? 'refundAmount';

  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$branchId',
        returnsCount: {
          $sum: { $cond: [{ $eq: ['$type', 'return'] }, 1, 0] },
        },
        exchangesCount: {
          $sum: { $cond: [{ $eq: ['$type', 'exchange'] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
        refundAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
        differenceDue: { $sum: { $ifNull: ['$differenceDue', 0] } },
        returnedUnits: { $sum: { $ifNull: ['$returnTotals.itemCount', 0] } },
        exchangedUnits: { $sum: { $ifNull: ['$exchangeTotals.itemCount', 0] } },
      },
    },
    {
      $lookup: {
        from: 'branches',
        localField: '_id',
        foreignField: '_id',
        as: 'branchDoc',
      },
    },
    { $unwind: { path: '$branchDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: { $ifNull: ['$branchDoc.name.en', 'HQ / Unassigned'] },
        code: '$branchDoc.code',
        returnsCount: 1,
        exchangesCount: 1,
        totalCount: 1,
        refundAmount: 1,
        differenceDue: 1,
        returnedUnits: 1,
        exchangedUnits: 1,
      },
    },
    { $sort: { [primarySort]: sortDirection, refundAmount: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    code: r.code ?? null,
    returnsCount: r.returnsCount ?? 0,
    exchangesCount: r.exchangesCount ?? 0,
    totalCount: r.totalCount ?? 0,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: r.differenceDue ?? 0,
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: r.exchangedUnits ?? 0,
  }));
}

/**
 * Returns return and exchange statistics grouped by channel (Online vs POS).
 */
export async function getReturnStatsByChannel(
  matchFilter,
  { limit = 50, sortBy = 'refundAmount', sortDir = 'desc' } = {},
) {
  const sortDirection = sortDir === 'asc' ? 1 : -1;
  const sortFieldMap = {
    refundAmount: 'refundAmount',
    differenceDue: 'differenceDue',
    returnedUnits: 'returnedUnits',
    exchangedUnits: 'exchangedUnits',
    returnsCount: 'returnsCount',
    exchangesCount: 'exchangesCount',
    totalCount: 'totalCount',
    name: 'name',
  };
  const primarySort = sortFieldMap[sortBy] ?? 'refundAmount';

  const rows = await ReturnExchange.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$channel',
        returnsCount: {
          $sum: { $cond: [{ $eq: ['$type', 'return'] }, 1, 0] },
        },
        exchangesCount: {
          $sum: { $cond: [{ $eq: ['$type', 'exchange'] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
        refundAmount: { $sum: { $ifNull: ['$refundAmount', 0] } },
        differenceDue: { $sum: { $ifNull: ['$differenceDue', 0] } },
        returnedUnits: { $sum: { $ifNull: ['$returnTotals.itemCount', 0] } },
        exchangedUnits: { $sum: { $ifNull: ['$exchangeTotals.itemCount', 0] } },
      },
    },
    {
      $project: {
        _id: 1,
        channel: '$_id',
        name: {
          $cond: [{ $eq: ['$_id', 'online'] }, 'Online Store', 'Point of Sale (POS)'],
        },
        returnsCount: 1,
        exchangesCount: 1,
        totalCount: 1,
        refundAmount: 1,
        differenceDue: 1,
        returnedUnits: 1,
        exchangedUnits: 1,
      },
    },
    { $sort: { [primarySort]: sortDirection, refundAmount: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id,
    name: r.name,
    channel: r.channel,
    returnsCount: r.returnsCount ?? 0,
    exchangesCount: r.exchangesCount ?? 0,
    totalCount: r.totalCount ?? 0,
    refundAmount: r.refundAmount ?? 0,
    differenceDue: r.differenceDue ?? 0,
    returnedUnits: r.returnedUnits ?? 0,
    exchangedUnits: r.exchangedUnits ?? 0,
  }));
}
