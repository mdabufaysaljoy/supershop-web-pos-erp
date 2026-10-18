import { describe, expect, it } from 'vitest';
import {
  ANALYTICS,
  calculateDeltaPercent,
  createAnalyticsSchemas,
  resolveAnalyticsPeriod,
} from '../index.js';

describe('Analytics Shared Contracts (P8.1)', () => {
  it('exports valid range and dimension constants', () => {
    expect(ANALYTICS.RANGES).toEqual(['today', '7d', '30d', '90d', 'year']);
    expect(ANALYTICS.DIMENSIONS).toEqual([
      'staff',
      'product',
      'category',
      'brand',
      'branch',
      'channel',
    ]);
  });

  it('validates query schema with defaults and valid ranges', () => {
    const { dashboardQuery, performanceQuery } = createAnalyticsSchemas();

    const empty = dashboardQuery.parse({});
    expect(empty.range).toBe('7d');
    expect(empty.branchId).toBeUndefined();

    const withBranch = dashboardQuery.parse({ range: '30d', branchId: 'br-123' });
    expect(withBranch.range).toBe('30d');
    expect(withBranch.branchId).toBe('br-123');

    expect(() => dashboardQuery.parse({ range: 'invalid' })).toThrow();

    // Performance query defaults
    const perfDefault = performanceQuery.parse({});
    expect(perfDefault.dimension).toBe('product');
    expect(perfDefault.range).toBe('7d');
    expect(perfDefault.sortBy).toBe('revenue');
    expect(perfDefault.sortDir).toBe('desc');
    expect(perfDefault.limit).toBe(50);

    // Performance query custom
    const perfCustom = performanceQuery.parse({
      dimension: 'staff',
      range: '30d',
      branchId: 'b1',
      limit: 10,
      sortBy: 'orders',
      sortDir: 'asc',
    });
    expect(perfCustom.dimension).toBe('staff');
    expect(perfCustom.sortBy).toBe('orders');
    expect(perfCustom.sortDir).toBe('asc');
    expect(perfCustom.limit).toBe(10);

    expect(() => performanceQuery.parse({ dimension: 'unknown' })).toThrow();
  });

  it('resolves date periods correctly for different ranges', () => {
    const fixedNow = new Date('2026-10-18T12:00:00.000Z');

    // 7d
    const p7d = resolveAnalyticsPeriod({ range: '7d', now: fixedNow });
    expect(p7d.groupBy).toBe('day');
    expect(p7d.end.toISOString()).toBe('2026-10-18T12:00:00.000Z');
    expect(p7d.start.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(p7d.previousEnd.getTime()).toBe(p7d.start.getTime() - 1);

    // today
    const pToday = resolveAnalyticsPeriod({ range: 'today', now: fixedNow });
    expect(pToday.groupBy).toBe('hour');
    expect(pToday.start.getUTCHours()).toBe(0);

    // year
    const pYear = resolveAnalyticsPeriod({ range: 'year', now: fixedNow });
    expect(pYear.groupBy).toBe('month');
  });

  it('calculates delta percent with edge cases', () => {
    expect(calculateDeltaPercent(120, 100)).toBe(20);
    expect(calculateDeltaPercent(80, 100)).toBe(-20);
    expect(calculateDeltaPercent(50, 0)).toBe(100);
    expect(calculateDeltaPercent(0, 0)).toBe(0);
    expect(calculateDeltaPercent(105.6, 100)).toBe(5.6);
  });
});
