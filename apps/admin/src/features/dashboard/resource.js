import { useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';

const BASE = '/api/v1/analytics/dashboard';

/**
 * Loads dashboard KPIs, sales graphs, channel breakdowns, top products and recent orders.
 *
 * @param {{ range?: string, branchId?: string | null }} [params]
 */
export function useDashboardOverview({ range = '7d', branchId = null } = {}) {
  const query = { range };
  if (branchId) query.branchId = branchId;

  return useQuery({
    queryKey: ['analytics', 'dashboard', query],
    queryFn: () => apiData(BASE, { query }),
    staleTime: 30_000,
  });
}
