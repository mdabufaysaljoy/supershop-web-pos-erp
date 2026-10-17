import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiData } from '@/lib/apiClient';

/**
 * The till's calls (P6.2). Three, and no more: find something, ask what it comes to, ring it up.
 * The basket itself lives in the browser until it is paid for — see `useSale`.
 */
const BASE = '/api/v1/pos';

/** Scan or type: sellable variants, priced, with what is on this branch's shelf. */
export const useTillSearch = (q, branchId) =>
  useQuery({
    queryKey: ['pos', 'search', branchId, q],
    queryFn: () => apiData(`${BASE}/search`, { query: { q, branchId } }),
    enabled: Boolean(branchId && q.trim().length >= 2),
    staleTime: 15_000,
  });

/** What the basket comes to — the server prices it, the till never adds up money itself. */
export const useQuote = () =>
  useMutation({ mutationFn: (body) => apiData(`${BASE}/quote`, { method: 'POST', body }) });

/** Rings the sale up. The key makes a retry return the first sale instead of selling twice. */
export const useSell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }) =>
      apiData(`${BASE}/sales`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
};

/** One variant by its exact barcode — what a scanner sends. */
export const lookupBarcode = (code) => api('/api/v1/products/lookup', { query: { code } });
