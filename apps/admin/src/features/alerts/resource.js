import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiData } from '@/lib/apiClient';

const KEY = ['alerts'];

/**
 * The bell's own feed. It is polled rather than pushed: a shop's admin is one browser tab on a
 * counter, and a poll every half minute costs less than keeping a socket open through every
 * proxy and sleep/wake a till goes through.
 */
export const useAlerts = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiData('/api/v1/alerts', { query: { limit: 20 } }),
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

/** Marks everything read, or just the ones given. */
export const useMarkAlertsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => api('/api/v1/alerts/read', { method: 'POST', body: ids ? { ids } : {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
};
