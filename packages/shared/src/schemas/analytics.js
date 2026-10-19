import { z } from 'zod';

export const ANALYTICS = Object.freeze({
  RANGES: Object.freeze(['today', '7d', '30d', '90d', 'year']),
  DIMENSIONS: Object.freeze(['staff', 'product', 'category', 'brand', 'branch', 'channel']),
  SORT_FIELDS: Object.freeze(['revenue', 'quantity', 'orders', 'name', 'profit']),
});

export const RETURNS_ANALYTICS = Object.freeze({
  DIMENSIONS: Object.freeze(['all', 'product', 'category', 'staff', 'branch', 'online', 'channel']),
  SORT_FIELDS: Object.freeze([
    'refundAmount',
    'differenceDue',
    'returnedUnits',
    'exchangedUnits',
    'returnsCount',
    'exchangesCount',
    'totalCount',
    'name',
  ]),
  CHANNELS: Object.freeze(['all', 'pos', 'online']),
});

export const FORECAST = Object.freeze({
  STRATEGIES: Object.freeze(['moving_average', 'seasonality']),
  HORIZONS: Object.freeze(['7d', '14d', '30d']),
  LOOKBACKS: Object.freeze(['14d', '30d', '60d', '90d']),
  RISK_LEVELS: Object.freeze(['all', 'out_of_stock', 'critical', 'warning', 'healthy']),
  SORT_FIELDS: Object.freeze([
    'daysRemaining',
    'onHand',
    'dailyVelocity',
    'recommendedReorderQty',
    'name',
  ]),
});

export function parseHorizonDays(horizon = '14d') {
  switch (horizon) {
    case '7d':
      return 7;
    case '14d':
      return 14;
    case '30d':
      return 30;
    default:
      return 14;
  }
}

export function parseLookbackDays(lookback = '30d') {
  switch (lookback) {
    case '14d':
      return 14;
    case '30d':
      return 30;
    case '60d':
      return 60;
    case '90d':
      return 90;
    default:
      return 30;
  }
}

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

  const salesForecastQuery = z.object({
    strategy: z.enum(FORECAST.STRATEGIES).default('moving_average'),
    horizon: z.enum(FORECAST.HORIZONS).default('14d'),
    lookback: z.enum(FORECAST.LOOKBACKS).default('30d'),
    branchId: z.string().trim().optional().nullable(),
    productId: z.string().trim().optional().nullable(),
  });

  const stockoutForecastQuery = z.object({
    lookback: z.enum(FORECAST.LOOKBACKS).default('30d'),
    branchId: z.string().trim().optional().nullable(),
    risk: z.enum(FORECAST.RISK_LEVELS).default('all'),
    targetDays: z.coerce.number().int().min(7).max(180).default(30),
    search: z.string().trim().optional().nullable(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    page: z.coerce.number().int().min(1).default(1),
    sortBy: z.enum(FORECAST.SORT_FIELDS).default('daysRemaining'),
    sortDir: z.enum(['asc', 'desc']).default('asc'),
  });

  const returnsReportQuery = z.object({
    dimension: z.enum(RETURNS_ANALYTICS.DIMENSIONS).default('all'),
    range: z.enum(ANALYTICS.RANGES).default('7d'),
    branchId: z.string().trim().optional().nullable(),
    channel: z.enum(RETURNS_ANALYTICS.CHANNELS).default('all'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    sortBy: z.enum(RETURNS_ANALYTICS.SORT_FIELDS).default('refundAmount'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  });

  return {
    dashboardQuery,
    performanceQuery,
    salesForecastQuery,
    stockoutForecastQuery,
    returnsReportQuery,
  };
}
