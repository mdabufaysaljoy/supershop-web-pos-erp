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
