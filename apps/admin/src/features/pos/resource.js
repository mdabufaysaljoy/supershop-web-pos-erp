import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';

/**
 * The till's calls (P6.2). Three, and no more: find something, ask what it comes to, ring it up.
 * The basket itself lives in the browser until it is paid for — see `useSale`.
 */
const BASE = '/api/v1/pos';

/** Scan or type: sellable variants, priced, with what is on this branch's shelf. */
export const useTillSearch = (arg1, arg2) => {
  const params =
    typeof arg1 === 'object' && arg1 !== null ? arg1 : { q: arg1 ?? '', branchId: arg2 ?? '' };
  const { q = '', branchId = '', categoryId = '', brandId = '' } = params;
  return useQuery({
    queryKey: ['pos', 'search', branchId, q, categoryId, brandId],
    queryFn: () =>
      apiData(`${BASE}/search`, {
        query: {
          branchId,
          ...(q && String(q).trim() ? { q: String(q).trim() } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(brandId ? { brandId } : {}),
        },
      }),
    enabled: Boolean(branchId),
    staleTime: 15_000,
  });
};

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

/**
 * One variant by its exact barcode — what a scanner sends. Answers `{ matchedBy, product,
 * variant }`: the envelope is unwrapped here so callers can read the match straight away.
 */
export const lookupBarcode = (code) => apiData('/api/v1/products/lookup', { query: { code } });

/** Look up loyalty customer by card barcode or QR code (or phone/email). */
export const lookupLoyalty = (code) =>
  apiData('/api/v1/loyalty/lookup', { query: { q: String(code).trim() } });

/** Payment methods offered for POS sales and walk-in customers (P6.1, P6.2). */
export const usePosPaymentMethods = () =>
  useQuery({
    queryKey: ['pos', 'payment-methods'],
    queryFn: () => apiData('/api/v1/payment-methods/public', { query: { channel: 'pos' } }),
    staleTime: 60_000,
  });
