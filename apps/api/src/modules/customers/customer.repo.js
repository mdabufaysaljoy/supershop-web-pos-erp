import { CUSTOMER_SEGMENTS, LOYALTY, ORDER_FLOW, validators } from '@supershop/shared';
import { Customer } from './customer.model.js';

const notDeleted = { deletedAt: null };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const findCustomerByEmail = (email) => Customer.findOne({ email, ...notDeleted }).lean();
export const findCustomerByPhone = (phone) => Customer.findOne({ phone, ...notDeleted }).lean();
export const findCustomerById = (id) => Customer.findOne({ _id: id, ...notDeleted }).lean();

/** Any customer (incl. soft-deleted) holding this email or phone — for uniqueness checks. */
export const findCustomerByEmailOrPhone = ({ email, phone }) =>
  Customer.findOne(
    { $or: [{ email }, ...(phone ? [{ phone }] : [])] },
    { email: 1, phone: 1 },
  ).lean();

export const createCustomer = (data, { session } = {}) =>
  Customer.create([data], { session }).then(([doc]) => doc.toObject());

export const markEmailVerified = (id) =>
  Customer.updateOne({ _id: id, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });

// ------------------------------------------------------------------ P3.5 account

/** Another live customer already using this phone (uniqueness check before an update). */
export const findOtherCustomerByPhone = (id, phone) =>
  Customer.findOne({ _id: { $ne: id }, phone }, { _id: 1 }).lean();

export const updateCustomer = (id, patch) =>
  Customer.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: patch },
    {
      returnDocument: 'after',
    },
  ).lean();

/**
 * Address writes replace the whole array: the service computes it from the current document, so
 * "exactly one default" is decided in one place. `updatedAt` guards against a lost update.
 * @returns {Promise<object | null>} the saved customer, or null when it changed meanwhile
 */
export const replaceAddresses = (id, expectedUpdatedAt, addresses) =>
  Customer.findOneAndUpdate(
    { _id: id, updatedAt: expectedUpdatedAt, ...notDeleted },
    { $set: { addresses } },
    { returnDocument: 'after' },
  ).lean();

/** Identity lookup for OAuth sign-in (`provider` + the provider's stable user id). */
export const findCustomerByIdentity = (provider, sub) =>
  Customer.findOne({ identities: { $elemMatch: { provider, sub } }, ...notDeleted }).lean();

export const addIdentity = (id, provider, sub, { session } = {}) =>
  Customer.updateOne(
    { _id: id, identities: { $not: { $elemMatch: { provider } } } },
    { $push: { identities: { provider, sub, linkedAt: new Date() } } },
    { session },
  );

// ------------------------------------------------------------------ P7.2 admin queries

/** Builds common aggregation pipeline stages for customer metrics and segment calculation. */
function buildCustomerMetricsPipeline({ q, status, now = new Date() } = {}) {
  const match = { deletedAt: null };
  if (status) match.status = status;
  if (q && q.trim()) {
    const term = q.trim();
    const rx = new RegExp(escapeRegex(term), 'i');
    const orConditions = [{ name: rx }, { email: rx }, { phone: rx }];
    const normPhone = validators.normalizePhone(term, { allowInternational: true });
    if (normPhone) {
      orConditions.push({ phone: normPhone });
    }
    const strippedZero = term.replace(/^0+/, '');
    if (strippedZero && strippedZero !== term) {
      orConditions.push({ phone: new RegExp(escapeRegex(strippedZero)) });
    }
    match.$or = orConditions;
  }

  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const d120 = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);

  return [
    { $match: match },
    {
      $lookup: {
        from: 'orders',
        let: { custId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$customer.customerId', '$$custId'] },
                  { $in: ['$status', [...ORDER_FLOW.sold]] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              orderCount: { $sum: 1 },
              lifetimeSpend: { $sum: '$totals.total' },
              lastOrderAt: { $max: '$placedAt' },
            },
          },
        ],
        as: 'orderStats',
      },
    },
    {
      $lookup: {
        from: 'loyalty_accounts',
        localField: '_id',
        foreignField: 'customerId',
        as: 'loyaltyAccount',
      },
    },
    {
      $addFields: {
        orderStats: { $arrayElemAt: ['$orderStats', 0] },
        loyaltyAccount: { $arrayElemAt: ['$loyaltyAccount', 0] },
      },
    },
    {
      $addFields: {
        orderCount: { $ifNull: ['$orderStats.orderCount', 0] },
        lifetimeSpend: { $ifNull: ['$orderStats.lifetimeSpend', 0] },
        lastOrderAt: '$orderStats.lastOrderAt',
        loyaltyPoints: { $ifNull: ['$loyaltyAccount.pointsBalance', 0] },
        loyaltyTier: { $ifNull: ['$loyaltyAccount.tier', LOYALTY.TIERS.BRONZE] },
      },
    },
    {
      $addFields: {
        segment: {
          $switch: {
            branches: [
              {
                case: {
                  $or: [
                    { $gte: ['$lifetimeSpend', 200_000] },
                    { $in: ['$loyaltyTier', ['gold', 'platinum']] },
                  ],
                },
                then: CUSTOMER_SEGMENTS.VIP,
              },
              {
                case: { $gte: ['$orderCount', 3] },
                then: CUSTOMER_SEGMENTS.LOYAL,
              },
              {
                case: {
                  $and: [{ $eq: ['$orderCount', 0] }, { $lt: ['$createdAt', d30] }],
                },
                then: CUSTOMER_SEGMENTS.IDLE,
              },
              {
                case: {
                  $and: [{ $lte: ['$orderCount', 1] }, { $gte: ['$createdAt', d30] }],
                },
                then: CUSTOMER_SEGMENTS.NEW,
              },
              {
                case: {
                  $and: [{ $ne: ['$lastOrderAt', null] }, { $gte: ['$lastOrderAt', d60] }],
                },
                then: CUSTOMER_SEGMENTS.ACTIVE,
              },
              {
                case: {
                  $and: [{ $ne: ['$lastOrderAt', null] }, { $gte: ['$lastOrderAt', d120] }],
                },
                then: CUSTOMER_SEGMENTS.SLIPPING,
              },
              {
                case: {
                  $and: [{ $ne: ['$lastOrderAt', null] }, { $lt: ['$lastOrderAt', d120] }],
                },
                then: CUSTOMER_SEGMENTS.CHURN_RISK,
              },
            ],
            default: CUSTOMER_SEGMENTS.IDLE,
          },
        },
      },
    },
  ];
}

/** Lists customers with aggregated lifetime spend, order count, points, and segment (P7.2). */
export async function listCustomersWithMetrics({
  q,
  status,
  segment,
  sort = { field: 'createdAt', direction: -1 },
  page = 1,
  limit = 20,
  now = new Date(),
} = {}) {
  const pipeline = buildCustomerMetricsPipeline({ q, status, now });

  if (segment && segment !== CUSTOMER_SEGMENTS.ALL) {
    pipeline.push({ $match: { segment } });
  }

  const sortStage = { [sort.field]: sort.direction };
  if (sort.field !== '_id') {
    sortStage._id = sort.direction;
  }

  pipeline.push({
    $facet: {
      meta: [{ $count: 'total' }],
      data: [
        { $sort: sortStage },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            name: 1,
            email: 1,
            emailVerifiedAt: 1,
            phone: 1,
            status: 1,
            lang: 1,
            createdAt: 1,
            orderCount: 1,
            lifetimeSpend: 1,
            lastOrderAt: 1,
            loyaltyPoints: 1,
            loyaltyTier: 1,
            segment: 1,
          },
        },
      ],
    },
  });

  const [result] = await Customer.aggregate(pipeline);
  const total = result?.meta?.[0]?.total ?? 0;
  const items = (result?.data ?? []).map((doc) => ({
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    emailVerified: Boolean(doc.emailVerifiedAt),
    phone: doc.phone,
    status: doc.status,
    lang: doc.lang,
    createdAt: doc.createdAt,
    orderCount: doc.orderCount ?? 0,
    lifetimeSpend: doc.lifetimeSpend ?? 0,
    lastOrderAt: doc.lastOrderAt ?? null,
    loyaltyPoints: doc.loyaltyPoints ?? 0,
    loyaltyTier: doc.loyaltyTier ?? 'bronze',
    segment: doc.segment ?? CUSTOMER_SEGMENTS.IDLE,
  }));

  return { items, total };
}

/** Summary counts of customers across all segments for tab badges (P7.2). */
export async function getSegmentsSummary({ q, status, now = new Date() } = {}) {
  const pipeline = [
    ...buildCustomerMetricsPipeline({ q, status, now }),
    {
      $group: {
        _id: '$segment',
        count: { $sum: 1 },
      },
    },
  ];

  const rows = await Customer.aggregate(pipeline);
  const counts = {
    [CUSTOMER_SEGMENTS.ALL]: 0,
    [CUSTOMER_SEGMENTS.VIP]: 0,
    [CUSTOMER_SEGMENTS.LOYAL]: 0,
    [CUSTOMER_SEGMENTS.ACTIVE]: 0,
    [CUSTOMER_SEGMENTS.NEW]: 0,
    [CUSTOMER_SEGMENTS.SLIPPING]: 0,
    [CUSTOMER_SEGMENTS.CHURN_RISK]: 0,
    [CUSTOMER_SEGMENTS.IDLE]: 0,
  };

  for (const row of rows) {
    if (counts[row._id] !== undefined) {
      counts[row._id] = row.count;
      counts[CUSTOMER_SEGMENTS.ALL] += row.count;
    }
  }

  return counts;
}
