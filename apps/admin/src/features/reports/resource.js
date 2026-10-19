import { useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';

const BASE = '/api/v1/analytics/performance';

/**
 * Loads performance report metrics by dimension (P8.2).
 *
 * @param {{
 *   dimension?: 'staff' | 'product' | 'category' | 'brand' | 'branch' | 'channel',
 *   range?: 'today' | '7d' | '30d' | '90d' | 'year',
 *   branchId?: string | null,
 *   limit?: number,
 *   sortBy?: string,
 *   sortDir?: 'asc' | 'desc',
 * }} [params]
 */
export function usePerformanceReport({
  dimension = 'product',
  range = '7d',
  branchId = null,
  limit = 50,
  sortBy = 'revenue',
  sortDir = 'desc',
} = {}) {
  const query = { dimension, range, limit, sortBy, sortDir };
  if (branchId) query.branchId = branchId;

  return useQuery({
    queryKey: ['analytics', 'performance', query],
    queryFn: () => apiData(BASE, { query }),
    staleTime: 30_000,
  });
}

const FORECAST_SALES_BASE = '/api/v1/analytics/forecast/sales';
const FORECAST_STOCKOUT_BASE = '/api/v1/analytics/forecast/stockout';

/**
 * Loads sales forecast with pluggable strategy (P8.3).
 */
export function useSalesForecast({
  strategy = 'moving_average',
  horizon = '14d',
  lookback = '30d',
  branchId = null,
  productId = null,
} = {}) {
  const query = { strategy, horizon, lookback };
  if (branchId) query.branchId = branchId;
  if (productId) query.productId = productId;

  return useQuery({
    queryKey: ['analytics', 'forecast', 'sales', query],
    queryFn: () => apiData(FORECAST_SALES_BASE, { query }),
    staleTime: 60_000,
  });
}

/**
 * Loads stock-out risk prediction and replenishment recommendations (P8.3).
 */
export function useStockoutForecast({
  lookback = '30d',
  branchId = null,
  risk = 'all',
  targetDays = 30,
  search = null,
  limit = 50,
  page = 1,
  sortBy = 'daysRemaining',
  sortDir = 'asc',
} = {}) {
  const query = { lookback, risk, targetDays, limit, page, sortBy, sortDir };
  if (branchId) query.branchId = branchId;
  if (search) query.search = search;

  return useQuery({
    queryKey: ['analytics', 'forecast', 'stockout', query],
    queryFn: () => apiData(FORECAST_STOCKOUT_BASE, { query }),
    staleTime: 60_000,
  });
}

const RETURNS_BASE = '/api/v1/analytics/returns';

/**
 * Loads returns and exchanges report metrics across dimensions (P8.4).
 *
 * @param {{
 *   dimension?: 'all' | 'product' | 'category' | 'staff' | 'branch' | 'online' | 'channel',
 *   range?: 'today' | '7d' | '30d' | '90d' | 'year',
 *   branchId?: string | null,
 *   channel?: 'all' | 'pos' | 'online',
 *   limit?: number,
 *   sortBy?: string,
 *   sortDir?: 'asc' | 'desc',
 * }} [params]
 */
export function useReturnsReport({
  dimension = 'all',
  range = '7d',
  branchId = null,
  channel = 'all',
  limit = 50,
  sortBy = 'refundAmount',
  sortDir = 'desc',
} = {}) {
  const query = { dimension, range, channel, limit, sortBy, sortDir };
  if (branchId) query.branchId = branchId;

  return useQuery({
    queryKey: ['analytics', 'returns', query],
    queryFn: () => apiData(RETURNS_BASE, { query }),
    staleTime: 30_000,
  });
}
