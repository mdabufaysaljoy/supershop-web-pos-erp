import { ORDER_FLOW } from '@supershop/shared';
import mongoose from 'mongoose';
import { Order } from './order.model.js';

const oid = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

/** The ONLY place touching the order model. */

export const insertOrder = (data, session) =>
  Order.create([data], { session }).then(([d]) => d.toObject());
export const findById = (id, session) =>
  Order.findById(id, null, session ? { session } : {}).lean();
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

// ------------------------------------------------------------------- P4.1 payments

/** The order behind a confirmation link (the raw document — services need more than the DTO). */
export const findDocByConfirmationToken = (confirmationTokenHash) =>
  Order.findOne({ confirmationTokenHash }).lean();

/** Applies a payment result to the order itself; `expected` keeps a late event from going back. */
export const updatePaymentState = (id, patch) =>
  Order.findOneAndUpdate({ _id: id }, { $set: patch }, { returnDocument: 'after' }).lean();

// --------------------------------------------------------------- P4.3 lifecycle

/**
 * Moves an order on, but ONLY from the status it was read in: two staff acting at once cannot
 * both apply their move (the second finds nothing to update).
 */
export const applyTransition = (id, expectedStatus, patch, historyEntry, session) =>
  Order.findOneAndUpdate(
    { _id: id, status: expectedStatus },
    { $set: patch, $push: { statusHistory: historyEntry } },
    { returnDocument: 'after', session },
  ).lean();

export const addNote = (id, note) =>
  Order.findOneAndUpdate(
    { _id: id },
    { $push: { notes: note } },
    { returnDocument: 'after' },
  ).lean();

export const addShipment = (id, shipment) =>
  Order.findOneAndUpdate(
    { _id: id },
    { $push: { shipments: shipment } },
    { returnDocument: 'after' },
  ).lean();

/** Admin list (P4.4 builds the screen on it). */
export async function listOrders(filter, { sort, skip, limit }) {
  const [items, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { items, total };
}

/**
 * Product ids ordered by how many units sold, newest window first — what the "best selling"
 * product rail asks for (P5.3). Only states the flow counts as sold are included.
 */
export async function topSellingProductIds({ limit, since }) {
  const rows = await Order.aggregate([
    { $match: { status: { $in: [...ORDER_FLOW.sold] }, placedAt: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.productId', units: { $sum: '$items.qty' } } },
    { $sort: { units: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => String(r._id));
}

/** Counter sales belonging to a shift (P6.5). */
export const listByShift = (shiftId, session) =>
  Order.find({ channel: 'pos', shiftId }, null, session ? { session } : {})
    .sort({ placedAt: 1, _id: 1 })
    .lean();

/** Updates order status and refunded amount inside a return/exchange transaction (P6.6). */
export const applyReturnOutcome = (
  id,
  expectedStatus,
  { status, refundDelta = 0, markPaymentRefunded = false, historyEntry },
  session,
) =>
  Order.findOneAndUpdate(
    { _id: id, status: expectedStatus },
    {
      $set: {
        status,
        ...(markPaymentRefunded ? { 'payment.status': 'refunded' } : {}),
      },
      ...(refundDelta > 0 ? { $inc: { 'payment.refundedAmount': refundDelta } } : {}),
      $push: { statusHistory: historyEntry },
    },
    { returnDocument: 'after', session },
  ).lean();

export const findSoldOrdersForCustomer = (customerId) =>
  Order.find({
    'customer.customerId': customerId,
    status: { $in: [...ORDER_FLOW.sold] },
  }).lean();

export const findRecentOrdersForCustomer = (customerId, limit = 10) =>
  Order.find({ 'customer.customerId': customerId })
    .sort({ placedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

// ------------------------------------------------------------- P8.1 analytics aggregations

export async function getOrdersAggregate(matchFilter) {
  const [row] = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$totals.total' },
        netSales: { $sum: '$totals.net' },
        ordersCount: { $sum: 1 },
        itemsSold: { $sum: '$totals.itemCount' },
        discountTotal: { $sum: '$totals.discountTotal' },
        taxTotal: { $sum: '$totals.vat' },
      },
    },
  ]);
  return {
    totalSales: row?.totalSales ?? 0,
    netSales: row?.netSales ?? 0,
    ordersCount: row?.ordersCount ?? 0,
    itemsSold: row?.itemsSold ?? 0,
    discountTotal: row?.discountTotal ?? 0,
    taxTotal: row?.taxTotal ?? 0,
  };
}

export async function getOrdersTimeSeries(matchFilter, groupBy = 'day') {
  let dateFormat = '%Y-%m-%d';
  if (groupBy === 'hour') {
    dateFormat = '%Y-%m-%d %H:00';
  } else if (groupBy === 'month') {
    dateFormat = '%Y-%m';
  }

  const rows = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$placedAt' } },
        revenue: { $sum: '$totals.total' },
        net: { $sum: '$totals.net' },
        orders: { $sum: 1 },
        posRevenue: {
          $sum: { $cond: [{ $eq: ['$channel', 'pos'] }, '$totals.total', 0] },
        },
        onlineRevenue: {
          $sum: { $cond: [{ $eq: ['$channel', 'online'] }, '$totals.total', 0] },
        },
        posOrders: {
          $sum: { $cond: [{ $eq: ['$channel', 'pos'] }, 1, 0] },
        },
        onlineOrders: {
          $sum: { $cond: [{ $eq: ['$channel', 'online'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => ({
    date: r._id,
    revenue: r.revenue,
    net: r.net,
    orders: r.orders,
    posRevenue: r.posRevenue,
    onlineRevenue: r.onlineRevenue,
    posOrders: r.posOrders,
    onlineOrders: r.onlineOrders,
  }));
}

export async function getChannelBreakdown(matchFilter) {
  const rows = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$channel',
        revenue: { $sum: '$totals.total' },
        orders: { $sum: 1 },
      },
    },
  ]);
  const out = {
    pos: { orders: 0, revenue: 0 },
    online: { orders: 0, revenue: 0 },
  };
  for (const r of rows) {
    if (r._id === 'pos' || r._id === 'online') {
      out[r._id] = { orders: r.orders, revenue: r.revenue };
    }
  }
  return out;
}

export async function getTopProducts(matchFilter, limit = 5) {
  const rows = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        imageUrl: { $first: '$items.imageUrl' },
        qty: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1, qty: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({
    productId: String(r._id),
    name: r.name,
    sku: r.sku,
    imageUrl: r.imageUrl ?? null,
    qty: r.qty,
    revenue: r.revenue,
  }));
}

export async function getRecentOrders(matchFilter, limit = 5) {
  const docs = await Order.find(matchFilter)
    .sort({ placedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return docs.map((o) => ({
    id: String(o._id),
    orderNo: o.orderNo,
    channel: o.channel,
    status: o.status,
    customerName: o.customer?.name ?? 'Walk-in',
    total: o.totals?.total ?? 0,
    placedAt: o.placedAt,
    branchId: o.branchId ? String(o.branchId) : null,
  }));
}

export async function getPaymentMethodsBreakdown(matchFilter) {
  const rows = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$payment.method',
        methodType: { $first: '$payment.methodType' },
        label: { $first: '$payment.label' },
        count: { $sum: 1 },
        total: { $sum: '$totals.total' },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) => ({
    method: r._id,
    methodType: r.methodType,
    label: r.label ?? r._id,
    count: r.count,
    total: r.total,
  }));
}

export async function getPerformanceByProduct(
  matchFilter,
  { limit = 50, sortBy = 'revenue', sortDir = 'desc', includeCost = false } = {},
) {
  const pipeline = [{ $match: matchFilter }, { $unwind: '$items' }];

  if (includeCost) {
    pipeline.push(
      {
        $lookup: {
          from: 'variants',
          localField: 'items.variantId',
          foreignField: '_id',
          as: 'variantDoc',
        },
      },
      {
        $addFields: {
          itemCost: {
            $multiply: ['$items.qty', { $ifNull: [{ $arrayElemAt: ['$variantDoc.cost', 0] }, 0] }],
          },
        },
      },
    );
  }

  const groupStage = {
    $group: {
      _id: '$items.productId',
      name: { $first: '$items.name' },
      sku: { $first: '$items.sku' },
      imageUrl: { $first: '$items.imageUrl' },
      quantity: { $sum: '$items.qty' },
      revenue: { $sum: '$items.lineTotal' },
      net: { $sum: '$items.net' },
      orders: { $addToSet: '$_id' },
    },
  };

  if (includeCost) {
    groupStage.$group.cost = { $sum: '$itemCost' };
  }

  pipeline.push(groupStage);

  const projectStage = {
    $project: {
      _id: 1,
      name: 1,
      sku: 1,
      imageUrl: 1,
      quantity: 1,
      revenue: 1,
      net: 1,
      ordersCount: { $size: '$orders' },
    },
  };

  if (includeCost) {
    projectStage.$project.cost = 1;
    projectStage.$project.profit = { $subtract: ['$net', '$cost'] };
  }

  pipeline.push(projectStage);

  const sortField =
    sortBy === 'quantity'
      ? 'quantity'
      : sortBy === 'orders'
        ? 'ordersCount'
        : sortBy === 'name'
          ? 'name'
          : sortBy === 'profit' && includeCost
            ? 'profit'
            : 'revenue';
  const sortDirection = sortDir === 'asc' ? 1 : -1;

  pipeline.push({ $sort: { [sortField]: sortDirection, revenue: -1 } });
  pipeline.push({ $limit: limit });

  const rows = await Order.aggregate(pipeline);
  return rows.map((r) => {
    const item = {
      id: String(r._id),
      name: r.name,
      sku: r.sku,
      imageUrl: r.imageUrl ?? null,
      quantity: r.quantity,
      revenue: r.revenue,
      net: r.net,
      ordersCount: r.ordersCount,
    };
    if (includeCost) {
      item.cost = r.cost ?? 0;
      item.profit = r.profit ?? 0;
      item.marginPercent = r.net > 0 ? Number(((item.profit / r.net) * 100).toFixed(1)) : 0;
    }
    return item;
  });
}

export async function getPerformanceByStaff(
  matchFilter,
  { limit = 50, sortBy = 'revenue', sortDir = 'desc' } = {},
) {
  const sortField =
    sortBy === 'quantity'
      ? 'quantity'
      : sortBy === 'orders'
        ? 'ordersCount'
        : sortBy === 'name'
          ? 'name'
          : 'revenue';
  const sortDirection = sortDir === 'asc' ? 1 : -1;

  const rows = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$staffId',
        ordersCount: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
        net: { $sum: '$totals.net' },
        quantity: { $sum: '$totals.itemCount' },
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
        name: { $ifNull: ['$staffDoc.name', 'Online / Unassigned'] },
        email: '$staffDoc.email',
        ordersCount: 1,
        revenue: 1,
        net: 1,
        quantity: 1,
        averageOrderValue: {
          $cond: [
            { $gt: ['$ordersCount', 0] },
            { $round: [{ $divide: ['$revenue', '$ordersCount'] }, 0] },
            0,
          ],
        },
      },
    },
    { $sort: { [sortField]: sortDirection, revenue: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    email: r.email ?? null,
    ordersCount: r.ordersCount,
    revenue: r.revenue,
    net: r.net,
    quantity: r.quantity,
    averageOrderValue: r.averageOrderValue,
  }));
}

export async function getPerformanceByCategory(
  matchFilter,
  { limit = 50, sortBy = 'revenue', sortDir = 'desc' } = {},
) {
  const sortField =
    sortBy === 'quantity'
      ? 'quantity'
      : sortBy === 'orders'
        ? 'ordersCount'
        : sortBy === 'name'
          ? 'name'
          : 'revenue';
  const sortDirection = sortDir === 'asc' ? 1 : -1;

  const rows = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'productDoc',
      },
    },
    { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$productDoc.categoryIds', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$productDoc.categoryIds',
        quantity: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
        net: { $sum: '$items.net' },
        orders: { $addToSet: '$_id' },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'categoryDoc',
      },
    },
    { $unwind: { path: '$categoryDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: { $ifNull: ['$categoryDoc.name.en', 'Uncategorized'] },
        slug: '$categoryDoc.slug',
        quantity: 1,
        revenue: 1,
        net: 1,
        ordersCount: { $size: '$orders' },
      },
    },
    { $sort: { [sortField]: sortDirection, revenue: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    slug: r.slug ?? null,
    quantity: r.quantity,
    revenue: r.revenue,
    net: r.net,
    ordersCount: r.ordersCount,
  }));
}

export async function getPerformanceByBrand(
  matchFilter,
  { limit = 50, sortBy = 'revenue', sortDir = 'desc' } = {},
) {
  const sortField =
    sortBy === 'quantity'
      ? 'quantity'
      : sortBy === 'orders'
        ? 'ordersCount'
        : sortBy === 'name'
          ? 'name'
          : 'revenue';
  const sortDirection = sortDir === 'asc' ? 1 : -1;

  const rows = await Order.aggregate([
    { $match: matchFilter },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'productDoc',
      },
    },
    { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$productDoc.brandId',
        quantity: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
        net: { $sum: '$items.net' },
        orders: { $addToSet: '$_id' },
      },
    },
    {
      $lookup: {
        from: 'brands',
        localField: '_id',
        foreignField: '_id',
        as: 'brandDoc',
      },
    },
    { $unwind: { path: '$brandDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: { $ifNull: ['$brandDoc.name', 'No Brand'] },
        slug: '$brandDoc.slug',
        quantity: 1,
        revenue: 1,
        net: 1,
        ordersCount: { $size: '$orders' },
      },
    },
    { $sort: { [sortField]: sortDirection, revenue: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    slug: r.slug ?? null,
    quantity: r.quantity,
    revenue: r.revenue,
    net: r.net,
    ordersCount: r.ordersCount,
  }));
}

export async function getPerformanceByBranch(
  matchFilter,
  { limit = 50, sortBy = 'revenue', sortDir = 'desc' } = {},
) {
  const sortField =
    sortBy === 'quantity'
      ? 'quantity'
      : sortBy === 'orders'
        ? 'ordersCount'
        : sortBy === 'name'
          ? 'name'
          : 'revenue';
  const sortDirection = sortDir === 'asc' ? 1 : -1;

  const rows = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$branchId',
        ordersCount: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
        net: { $sum: '$totals.net' },
        quantity: { $sum: '$totals.itemCount' },
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
        ordersCount: 1,
        revenue: 1,
        net: 1,
        quantity: 1,
        averageOrderValue: {
          $cond: [
            { $gt: ['$ordersCount', 0] },
            { $round: [{ $divide: ['$revenue', '$ordersCount'] }, 0] },
            0,
          ],
        },
      },
    },
    { $sort: { [sortField]: sortDirection, revenue: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id ? String(r._id) : null,
    name: r.name,
    code: r.code ?? null,
    ordersCount: r.ordersCount,
    revenue: r.revenue,
    net: r.net,
    quantity: r.quantity,
    averageOrderValue: r.averageOrderValue,
  }));
}

export async function getPerformanceByChannel(
  matchFilter,
  { limit = 50, sortBy = 'revenue', sortDir = 'desc' } = {},
) {
  const sortField =
    sortBy === 'quantity'
      ? 'quantity'
      : sortBy === 'orders'
        ? 'ordersCount'
        : sortBy === 'name'
          ? 'name'
          : 'revenue';
  const sortDirection = sortDir === 'asc' ? 1 : -1;

  const rows = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$channel',
        ordersCount: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
        net: { $sum: '$totals.net' },
        quantity: { $sum: '$totals.itemCount' },
      },
    },
    {
      $project: {
        _id: 1,
        name: {
          $cond: [{ $eq: ['$_id', 'pos'] }, 'Point of Sale (POS)', 'Online Store'],
        },
        ordersCount: 1,
        revenue: 1,
        net: 1,
        quantity: 1,
        averageOrderValue: {
          $cond: [
            { $gt: ['$ordersCount', 0] },
            { $round: [{ $divide: ['$revenue', '$ordersCount'] }, 0] },
            0,
          ],
        },
      },
    },
    { $sort: { [sortField]: sortDirection, revenue: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    id: r._id,
    channel: r._id,
    name: r.name,
    ordersCount: r.ordersCount,
    revenue: r.revenue,
    net: r.net,
    quantity: r.quantity,
    averageOrderValue: r.averageOrderValue,
  }));
}

/**
 * Contiguous daily sales history for forecasting (P8.3).
 */
export async function getDailySalesHistory({ start, end, branchId = null, productId = null }) {
  const match = {
    status: { $ne: 'cancelled' },
    placedAt: { $gte: start, $lte: end },
  };
  if (branchId) {
    match.branchId = oid(branchId);
  }

  if (productId) {
    const pId = oid(productId);
    const rows = await Order.aggregate([
      { $match: { ...match, 'items.productId': pId } },
      { $unwind: '$items' },
      { $match: { 'items.productId': pId } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
          quantity: { $sum: '$items.qty' },
          revenue: { $sum: '$items.lineTotal' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({
      date: r._id,
      quantity: r.quantity,
      revenue: r.revenue,
      orders: r.orders,
    }));
  }

  const rows = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } },
        quantity: { $sum: '$totals.itemCount' },
        revenue: { $sum: '$totals.total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({
    date: r._id,
    quantity: r.quantity,
    revenue: r.revenue,
    orders: r.orders,
  }));
}

/**
 * Historical sales velocity per variant for stock-out prediction (P8.3).
 */
export async function getVariantSalesVelocity({ start, end, branchId = null }) {
  const match = {
    status: { $ne: 'cancelled' },
    placedAt: { $gte: start, $lte: end },
  };
  if (branchId) {
    match.branchId = oid(branchId);
  }

  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.variantId',
        productId: { $first: '$items.productId' },
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        unitsSold: { $sum: '$items.qty' },
        ordersCount: { $sum: 1 },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
  ]);

  return rows.map((r) => ({
    variantId: String(r._id),
    productId: String(r.productId),
    name: r.name,
    sku: r.sku,
    unitsSold: r.unitsSold,
    ordersCount: r.ordersCount,
    revenue: r.revenue,
  }));
}
