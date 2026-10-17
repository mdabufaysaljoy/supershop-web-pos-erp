import { describe, expect, it } from 'vitest';
import {
  calculateEarnedPoints,
  calculatePointsForDiscount,
  calculateRedemptionDiscount,
  calculateReversedPoints,
  computeTier,
  createLoyaltySchemas,
  isRedemptionAllowed,
  LOYALTY,
} from '../index.js';

describe('P7.1 Loyalty Engine - Shared Logic', () => {
  describe('calculateEarnedPoints', () => {
    it('earns 1 point per 100 SAR (10,000 halalas) by default', () => {
      expect(calculateEarnedPoints(10_000)).toBe(1);
      expect(calculateEarnedPoints(25_000)).toBe(2);
      expect(calculateEarnedPoints(9_999)).toBe(0);
      expect(calculateEarnedPoints(100_000)).toBe(10);
    });

    it('supports configurable earn spend rate', () => {
      // 50 SAR = 1 pt (5,000 halalas)
      expect(calculateEarnedPoints(12_000, 5_000)).toBe(2);
      // 200 SAR = 1 pt (20,000 halalas)
      expect(calculateEarnedPoints(39_000, 20_000)).toBe(1);
    });

    it('handles non-positive and invalid inputs safely', () => {
      expect(calculateEarnedPoints(0)).toBe(0);
      expect(calculateEarnedPoints(-500)).toBe(0);
      expect(calculateEarnedPoints(null)).toBe(0);
      expect(calculateEarnedPoints(undefined)).toBe(0);
      expect(calculateEarnedPoints(10_000, 0)).toBe(0);
      expect(calculateEarnedPoints(10_000, -100)).toBe(0);
    });
  });

  describe('calculateRedemptionDiscount', () => {
    it('redeems 1 point for 1 SAR (100 halalas) by default', () => {
      expect(calculateRedemptionDiscount(10)).toBe(1_000); // 10 SAR
      expect(calculateRedemptionDiscount(50)).toBe(5_000); // 50 SAR
      expect(calculateRedemptionDiscount(1)).toBe(100);
    });

    it('caps redemption discount at maxDiscountHalalas when provided', () => {
      // 50 points = 5,000 halalas, but max order total is 3,500 halalas
      expect(calculateRedemptionDiscount(50, 100, 3_500)).toBe(3_500);
      // within limit
      expect(calculateRedemptionDiscount(20, 100, 3_500)).toBe(2_000);
    });

    it('supports custom point redemption value', () => {
      // 1 pt = 200 halalas (2 SAR)
      expect(calculateRedemptionDiscount(15, 200)).toBe(3_000);
    });

    it('handles zero or invalid points gracefully', () => {
      expect(calculateRedemptionDiscount(0)).toBe(0);
      expect(calculateRedemptionDiscount(-10)).toBe(0);
      expect(calculateRedemptionDiscount(null)).toBe(0);
    });
  });

  describe('calculatePointsForDiscount', () => {
    it('computes points needed with ceiling', () => {
      expect(calculatePointsForDiscount(1_000, 100)).toBe(10);
      expect(calculatePointsForDiscount(1_050, 100)).toBe(11);
      expect(calculatePointsForDiscount(0, 100)).toBe(0);
      expect(calculatePointsForDiscount(-50, 100)).toBe(0);
    });
  });

  describe('calculateReversedPoints', () => {
    it('computes exact points to claw back on refunded returns', () => {
      // 100 SAR return at 100 SAR/pt -> 1 pt reversed
      expect(calculateReversedPoints(10_000)).toBe(1);
      expect(calculateReversedPoints(25_000)).toBe(2);
      expect(calculateReversedPoints(9_000)).toBe(0);
    });
  });

  describe('computeTier', () => {
    it('assigns tiers based on lifetime earned points', () => {
      expect(computeTier(0)).toBe(LOYALTY.TIERS.BRONZE);
      expect(computeTier(99)).toBe(LOYALTY.TIERS.BRONZE);
      expect(computeTier(100)).toBe(LOYALTY.TIERS.SILVER);
      expect(computeTier(499)).toBe(LOYALTY.TIERS.SILVER);
      expect(computeTier(500)).toBe(LOYALTY.TIERS.GOLD);
      expect(computeTier(999)).toBe(LOYALTY.TIERS.GOLD);
      expect(computeTier(1000)).toBe(LOYALTY.TIERS.PLATINUM);
      expect(computeTier(5000)).toBe(LOYALTY.TIERS.PLATINUM);
    });
  });

  describe('isRedemptionAllowed', () => {
    it('allows valid redemption and calculates discount', () => {
      const res = isRedemptionAllowed({
        points: 20,
        currentBalance: 50,
        minRedeemPoints: 10,
        maxRedeemPointsPerOrder: 100,
        orderTotalHalalas: 5_000,
        pointRedemptionValue: 100,
      });
      expect(res.allowed).toBe(true);
      expect(res.discountHalalas).toBe(2_000);
    });

    it('rejects when requested points exceed customer balance', () => {
      const res = isRedemptionAllowed({
        points: 60,
        currentBalance: 50,
        minRedeemPoints: 10,
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('LOYALTY_INSUFFICIENT_POINTS');
    });

    it('rejects when balance is below minimum threshold', () => {
      const res = isRedemptionAllowed({
        points: 5,
        currentBalance: 8,
        minRedeemPoints: 10,
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('MIN_POINTS_NOT_MET');
    });

    it('rejects when points exceed max points per order', () => {
      const res = isRedemptionAllowed({
        points: 150,
        currentBalance: 200,
        minRedeemPoints: 10,
        maxRedeemPointsPerOrder: 100,
      });
      expect(res.allowed).toBe(false);
      expect(res.code).toBe('MAX_POINTS_EXCEEDED');
    });

    it('caps discount at order total when allowed', () => {
      const res = isRedemptionAllowed({
        points: 50,
        currentBalance: 50,
        minRedeemPoints: 10,
        maxRedeemPointsPerOrder: 0,
        orderTotalHalalas: 3_000, // 30 SAR max
        pointRedemptionValue: 100,
      });
      expect(res.allowed).toBe(true);
      expect(res.discountHalalas).toBe(3_000);
    });
  });

  describe('createLoyaltySchemas', () => {
    const schemas = createLoyaltySchemas();

    it('validates point adjustment schema', () => {
      const valid = schemas.adjustPoints.safeParse({
        customerId: '507f1f77bcf86cd799439011',
        delta: 25,
        reason: 'Customer goodwill gesture',
      });
      expect(valid.success).toBe(true);

      const zeroDelta = schemas.adjustPoints.safeParse({
        customerId: '507f1f77bcf86cd799439011',
        delta: 0,
        reason: 'Zero test',
      });
      expect(zeroDelta.success).toBe(false);

      const emptyReason = schemas.adjustPoints.safeParse({
        customerId: '507f1f77bcf86cd799439011',
        delta: -10,
        reason: '   ',
      });
      expect(emptyReason.success).toBe(false);
    });

    it('validates redemption schema', () => {
      const valid = schemas.redeemPoints.safeParse({
        customerId: '507f1f77bcf86cd799439011',
        points: 50,
        orderId: '507f1f77bcf86cd799439012',
        orderNo: 'ORD-1001',
        orderTotalHalalas: 15_000,
      });
      expect(valid.success).toBe(true);

      const invalidPoints = schemas.redeemPoints.safeParse({
        customerId: '507f1f77bcf86cd799439011',
        points: 0,
      });
      expect(invalidPoints.success).toBe(false);
    });

    it('validates quote and lookup schemas', () => {
      expect(schemas.quoteRedemption.safeParse({ points: 20 }).success).toBe(true);
      expect(schemas.quoteRedemption.safeParse({ points: -5 }).success).toBe(false);

      expect(schemas.lookupQuery.safeParse({ q: '+966501234567' }).success).toBe(true);
      expect(schemas.lookupQuery.safeParse({ q: '   ' }).success).toBe(false);
    });
  });
});
