/**
 * P7.1 — Loyalty engine: earn rule (default 100 SAR = 1 pt, configurable),
 * redeem rule, ledger, membership by phone/email, expiry option, reversal on returns.
 */

export const LOYALTY = Object.freeze({
  TRANSACTION_TYPES: Object.freeze({
    EARN: 'earn',
    REDEEM: 'redeem',
    REVERSE: 'reverse',
    ADJUST: 'adjust',
    EXPIRE: 'expire',
  }),
  MEMBERSHIP_STATUSES: Object.freeze({
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
  }),
  TIERS: Object.freeze({
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
    PLATINUM: 'platinum',
  }),
  TIER_THRESHOLDS: Object.freeze({
    BRONZE: 0,
    SILVER: 100,
    GOLD: 500,
    PLATINUM: 1000,
  }),
  DEFAULTS: Object.freeze({
    /** 100 SAR spend (10,000 halalas) earns 1 point. */
    EARN_SPEND_RATE: 10_000,
    /** 1 point redeems for 1 SAR (100 halalas) discount. */
    POINT_REDEMPTION_VALUE: 100,
    /** Minimum points required to redeem. */
    MIN_REDEEM_POINTS: 10,
    /** 0 = no maximum points limit per order. */
    MAX_REDEEM_POINTS_PER_ORDER: 0,
    /** Default 365 days expiry for earned points (0 = never expire). */
    EXPIRY_DAYS: 365,
  }),
});

/**
 * Calculates earned loyalty points from an order spend total in halalas.
 * Integer division: Math.floor(spendHalalas / earnSpendRate).
 * E.g., 250 SAR (25,000 halalas) at 100 SAR/pt (10,000 halalas) -> 2 points.
 *
 * @param {number} spendHalalas
 * @param {number} [earnSpendRate] Halalas needed to earn 1 point (default 10,000 = 100 SAR)
 * @returns {number} Non-negative integer points earned
 */
export function calculateEarnedPoints(
  spendHalalas,
  earnSpendRate = LOYALTY.DEFAULTS.EARN_SPEND_RATE,
) {
  if (!Number.isFinite(spendHalalas) || spendHalalas <= 0) return 0;
  if (!Number.isFinite(earnSpendRate) || earnSpendRate <= 0) return 0;
  return Math.floor(spendHalalas / earnSpendRate);
}

/**
 * Calculates redemption discount in halalas from points.
 * E.g. 50 points at 100 halalas/pt = 5,000 halalas (50 SAR).
 *
 * @param {number} points
 * @param {number} [pointRedemptionValue] Halalas discount per 1 point (default 100)
 * @param {number|null} [maxDiscountHalalas] Optional ceiling (e.g. order total)
 * @returns {number} Non-negative integer halalas discount
 */
export function calculateRedemptionDiscount(
  points,
  pointRedemptionValue = LOYALTY.DEFAULTS.POINT_REDEMPTION_VALUE,
  maxDiscountHalalas = null,
) {
  if (!Number.isFinite(points) || points <= 0) return 0;
  if (!Number.isFinite(pointRedemptionValue) || pointRedemptionValue <= 0) return 0;
  const gross = Math.floor(points * pointRedemptionValue);
  if (
    maxDiscountHalalas != null &&
    Number.isFinite(maxDiscountHalalas) &&
    maxDiscountHalalas >= 0
  ) {
    return Math.min(gross, Math.floor(maxDiscountHalalas));
  }
  return gross;
}

/**
 * Calculates how many points are needed to achieve a target discount in halalas.
 * E.g. 5,000 halalas at 100 halalas/pt = 50 points.
 * Uses Math.ceil so the discount is fully covered.
 *
 * @param {number} discountHalalas
 * @param {number} [pointRedemptionValue]
 * @returns {number} Non-negative integer points
 */
export function calculatePointsForDiscount(
  discountHalalas,
  pointRedemptionValue = LOYALTY.DEFAULTS.POINT_REDEMPTION_VALUE,
) {
  if (!Number.isFinite(discountHalalas) || discountHalalas <= 0) return 0;
  if (!Number.isFinite(pointRedemptionValue) || pointRedemptionValue <= 0) return 0;
  return Math.ceil(discountHalalas / pointRedemptionValue);
}

/**
 * Calculates how many points must be reversed on a refund.
 * E.g. 100 SAR return at 100 SAR/pt = 1 point reversed.
 *
 * @param {number} returnedAmountHalalas
 * @param {number} [earnSpendRate]
 * @returns {number} Non-negative integer points to claw back
 */
export function calculateReversedPoints(
  returnedAmountHalalas,
  earnSpendRate = LOYALTY.DEFAULTS.EARN_SPEND_RATE,
) {
  return calculateEarnedPoints(returnedAmountHalalas, earnSpendRate);
}

/**
 * Determines customer membership tier from lifetime earned points.
 *
 * @param {number} lifetimeEarned
 * @returns {string} Tier identifier ('bronze' | 'silver' | 'gold' | 'platinum')
 */
export function computeTier(lifetimeEarned) {
  const earned = Math.max(0, Number(lifetimeEarned) || 0);
  if (earned >= LOYALTY.TIER_THRESHOLDS.PLATINUM) return LOYALTY.TIERS.PLATINUM;
  if (earned >= LOYALTY.TIER_THRESHOLDS.GOLD) return LOYALTY.TIERS.GOLD;
  if (earned >= LOYALTY.TIER_THRESHOLDS.SILVER) return LOYALTY.TIERS.SILVER;
  return LOYALTY.TIERS.BRONZE;
}

/**
 * Validates whether a points redemption is allowed and calculates its discount.
 *
 * @param {object} params
 * @param {number} params.points Points requested to redeem
 * @param {number} params.currentBalance Customer's current balance
 * @param {number} [params.minRedeemPoints] Minimum required balance / redemption
 * @param {number} [params.maxRedeemPointsPerOrder] Maximum allowed points per order (0 = unlimited)
 * @param {number|null} [params.orderTotalHalalas] Total halalas of the order
 * @param {number} [params.pointRedemptionValue] Halalas discount per 1 point
 * @returns {{ allowed: boolean, discountHalalas: number, code?: string, reason?: string }}
 */
export function isRedemptionAllowed({
  points,
  currentBalance,
  minRedeemPoints = LOYALTY.DEFAULTS.MIN_REDEEM_POINTS,
  maxRedeemPointsPerOrder = LOYALTY.DEFAULTS.MAX_REDEEM_POINTS_PER_ORDER,
  orderTotalHalalas = null,
  pointRedemptionValue = LOYALTY.DEFAULTS.POINT_REDEMPTION_VALUE,
}) {
  const pts = Math.floor(Number(points) || 0);
  const bal = Math.floor(Number(currentBalance) || 0);

  if (pts <= 0) {
    return {
      allowed: false,
      discountHalalas: 0,
      code: 'INVALID_POINTS',
      reason: 'Points must be greater than zero',
    };
  }
  if (pts > bal) {
    return {
      allowed: false,
      discountHalalas: 0,
      code: 'LOYALTY_INSUFFICIENT_POINTS',
      reason: `Insufficient points (balance: ${bal}, requested: ${pts})`,
    };
  }
  if (bal < minRedeemPoints) {
    return {
      allowed: false,
      discountHalalas: 0,
      code: 'MIN_POINTS_NOT_MET',
      reason: `A minimum balance of ${minRedeemPoints} points is required to redeem`,
    };
  }
  if (maxRedeemPointsPerOrder > 0 && pts > maxRedeemPointsPerOrder) {
    return {
      allowed: false,
      discountHalalas: 0,
      code: 'MAX_POINTS_EXCEEDED',
      reason: `Cannot redeem more than ${maxRedeemPointsPerOrder} points per order`,
    };
  }

  const discount = calculateRedemptionDiscount(pts, pointRedemptionValue, orderTotalHalalas);
  return { allowed: true, discountHalalas: discount };
}
