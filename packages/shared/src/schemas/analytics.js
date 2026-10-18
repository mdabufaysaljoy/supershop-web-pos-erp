import { z } from 'zod';

export const ANALYTICS = Object.freeze({
  RANGES: Object.freeze(['today', '7d', '30d', '90d', 'year']),
  DIMENSIONS: Object.freeze(['staff', 'product', 'category', 'brand', 'branch', 'channel']),
  SORT_FIELDS: Object.freeze(['revenue', 'quantity', 'orders', 'name', 'profit']),
});

/**
 * Calculates start, end, previousStart, previousEnd, and bucket grouping for a range.
 * Pure function so it can be tested with a deterministic `now`.
 *
 * @param {{ range?: string, now?: Date }} [opts]
 */
export function resolveAnalyticsPeriod({ range = '7d', now = new Date() } = {}) {
  const end = new Date(now);
  const start = new Date(now);
  let groupBy = 'day';
  let diffMs = 0;

  switch (range) {
    case 'today': {
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(23, 59, 59, 999);
      groupBy = 'hour';
      diffMs = 24 * 60 * 60 * 1000;
      break;
    }
    case '7d': {
      start.setUTCDate(start.getUTCDate() - 7);
      start.setUTCHours(0, 0, 0, 0);
      groupBy = 'day';
      diffMs = 7 * 24 * 60 * 60 * 1000;
      break;
    }
    case '30d': {
      start.setUTCDate(start.getUTCDate() - 30);
      start.setUTCHours(0, 0, 0, 0);
      groupBy = 'day';
      diffMs = 30 * 24 * 60 * 60 * 1000;
      break;
    }
    case '90d': {
      start.setUTCDate(start.getUTCDate() - 90);
      start.setUTCHours(0, 0, 0, 0);
      groupBy = 'day';
      diffMs = 90 * 24 * 60 * 60 * 1000;
      break;
    }
    case 'year': {
      start.setUTCDate(start.getUTCDate() - 365);
      start.setUTCHours(0, 0, 0, 0);
      groupBy = 'month';
      diffMs = 365 * 24 * 60 * 60 * 1000;
      break;
    }
    default: {
      start.setUTCDate(start.getUTCDate() - 7);
      start.setUTCHours(0, 0, 0, 0);
      groupBy = 'day';
      diffMs = 7 * 24 * 60 * 60 * 1000;
      break;
    }
  }

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - diffMs + 1);

  return {
    start,
    end,
    previousStart,
    previousEnd,
    groupBy,
  };
}

/**
 * Calculates percentage change from previous to current.
 *
 * @param {number} current
 * @param {number} previous
 * @returns {number}
 */
export function calculateDeltaPercent(current = 0, previous = 0) {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  const delta = ((current - previous) / previous) * 100;
  return Number(delta.toFixed(1));
}

export function createAnalyticsSchemas() {
  const dashboardQuery = z.object({
    range: z.enum(ANALYTICS.RANGES).default('7d'),
    branchId: z.string().trim().optional().nullable(),
  });

  const performanceQuery = z.object({
    dimension: z.enum(ANALYTICS.DIMENSIONS).default('product'),
    range: z.enum(ANALYTICS.RANGES).default('7d'),
    branchId: z.string().trim().optional().nullable(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    sortBy: z.enum(ANALYTICS.SORT_FIELDS).default('revenue'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  });

  return {
    dashboardQuery,
    performanceQuery,
  };
}
