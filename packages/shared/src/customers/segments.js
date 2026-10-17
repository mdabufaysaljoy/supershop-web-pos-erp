/**
 * Customer segmentation categories and pure derivation logic (P7.2, CLAUDE.md §2.4).
 * Segments help identify customer value and engagement for reporting and marketing campaigns (P7.3).
 */
export const CUSTOMER_SEGMENTS = Object.freeze({
  ALL: 'all',
  VIP: 'vip',
  LOYAL: 'loyal',
  ACTIVE: 'active',
  NEW: 'new',
  SLIPPING: 'slipping',
  CHURN_RISK: 'churn_risk',
  IDLE: 'idle',
});

/**
 * Derives segment for a customer based on RFM-style activity, spend, and loyalty tier.
 * Rules:
 *  1. VIP: Lifetime spend >= 2,000 SAR (200,000 halalas) OR tier is gold/platinum.
 *  2. Loyal: 3 or more paid/completed orders.
 *  3. Idle: 0 orders and registered > 30 days ago.
 *  4. New: Registered within last 30 days and at most 1 order.
 *  5. Active: Last purchase was within last 60 days.
 *  6. Slipping: Last purchase was between 60 and 120 days ago.
 *  7. Churn risk: Last purchase was > 120 days ago.
 *
 * @param {Object} [params]
 * @param {number} [params.orderCount=0] Number of qualifying completed orders
 * @param {number} [params.lifetimeSpendHalalas=0] Cumulative spend in halalas
 * @param {Date|string|null} [params.lastOrderAt=null] Timestamp of most recent order
 * @param {Date|string|null} [params.createdAt=null] Account creation timestamp
 * @param {string} [params.tier='bronze'] Current loyalty tier
 * @param {Date|string|number} [params.now=new Date()] Reference time for relative date checks
 * @returns {string} One of CUSTOMER_SEGMENTS (vip|loyal|active|new|slipping|churn_risk|idle)
 */
export function deriveCustomerSegment({
  orderCount = 0,
  lifetimeSpendHalalas = 0,
  lastOrderAt = null,
  createdAt = null,
  tier = 'bronze',
  now = new Date(),
} = {}) {
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const createdTime = createdAt ? new Date(createdAt).getTime() : currentTime;
  const lastOrderTime = lastOrderAt ? new Date(lastOrderAt).getTime() : null;

  const daysSinceLastOrder =
    lastOrderTime != null
      ? Math.max(0, Math.floor((currentTime - lastOrderTime) / (1000 * 60 * 60 * 24)))
      : null;
  const daysSinceCreated = Math.max(
    0,
    Math.floor((currentTime - createdTime) / (1000 * 60 * 60 * 24)),
  );

  // 1. VIP: Spend >= 200,000 halalas (2,000 SAR) or elite loyalty tier
  if (lifetimeSpendHalalas >= 200_000 || tier === 'gold' || tier === 'platinum') {
    return CUSTOMER_SEGMENTS.VIP;
  }

  // 2. Loyal: Frequent buyer with 3+ purchases
  if (orderCount >= 3) {
    return CUSTOMER_SEGMENTS.LOYAL;
  }

  // 3. Idle: Registered more than 30 days ago but has never placed an order
  if (orderCount === 0 && daysSinceCreated > 30) {
    return CUSTOMER_SEGMENTS.IDLE;
  }

  // 4. New: Joined recently (<= 30 days) with 0 or 1 purchase
  if (daysSinceCreated <= 30 && orderCount <= 1) {
    return CUSTOMER_SEGMENTS.NEW;
  }

  // 5. Active: Recent purchase within the last 60 days
  if (daysSinceLastOrder !== null && daysSinceLastOrder <= 60) {
    return CUSTOMER_SEGMENTS.ACTIVE;
  }

  // 6. Slipping: Last purchase between 60 and 120 days ago
  if (daysSinceLastOrder !== null && daysSinceLastOrder <= 120) {
    return CUSTOMER_SEGMENTS.SLIPPING;
  }

  // 7. Churn risk: Has not purchased in over 120 days
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 120) {
    return CUSTOMER_SEGMENTS.CHURN_RISK;
  }

  return orderCount === 0 ? CUSTOMER_SEGMENTS.IDLE : CUSTOMER_SEGMENTS.ACTIVE;
}
