import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { printRaw } from '@/lib/qz';

/**
 * Returns & exchanges hooks (P6.6): look up an order by number/ID, quote return/exchange totals,
 * execute atomic return or exchange, and thermally print the return credit note / exchange receipt.
 */
const BASE = '/api/v1/returns';

export const RETURN_KEYS = {
  all: ['returns'],
  list: (query) => ['returns', 'list', query],
  lookup: (q) => ['returns', 'lookup', q],
  detail: (id) => ['returns', 'detail', id],
};

export const useReturns = (query = {}, options = {}) =>
  useQuery({
    queryKey: RETURN_KEYS.list(query),
    queryFn: () => api(BASE, { query }),
    ...options,
  });

export const useLookupReturnOrder = (q, { enabled = true } = {}) =>
  useQuery({
    queryKey: RETURN_KEYS.lookup(q),
    queryFn: () => apiData(`${BASE}/lookup-order`, { query: { q } }),
    enabled: Boolean(enabled && q && String(q).trim().length >= 3),
    retry: false,
  });

export const useReturnDetail = (id, { enabled = true } = {}) =>
  useQuery({
    queryKey: RETURN_KEYS.detail(id),
    queryFn: () => apiData(`${BASE}/${id}`),
    enabled: Boolean(id && enabled),
  });

export const useQuoteReturn = () =>
  useMutation({
    mutationFn: (body) => apiData(`${BASE}/quote`, { method: 'POST', body }),
  });

export const useCreateReturn = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }) =>
      apiData(BASE, {
        method: 'POST',
        body,
        ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: RETURN_KEYS.all });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      toast.success(
        data?.type === 'exchange'
          ? t('returns.exchangeCreatedToast', { number: data.returnNo })
          : t('returns.returnCreatedToast', { number: data.returnNo }),
      );
    },
    onError: (err) => {
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
};

export const usePrintReturnReceipt = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ id, profileId }) => {
      const job = await apiData(`${BASE}/${id}/print`, {
        method: 'POST',
        body: profileId ? { profileId } : {},
      });
      await printRaw(job);
      return job;
    },
    onSuccess: () => {
      toast.success(t('returns.printedToast'));
    },
    onError: (err) => {
      toast.error(t('returns.printFailed', { reason: err?.message ?? '' }));
    },
  });
};
