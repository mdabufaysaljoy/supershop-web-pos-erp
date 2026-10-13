import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

const BASE = '/api/v1/inventory';
const list = (path, query) => () => api(`${BASE}/${path}`, { query });

/** `{ data, meta }` pages of stock levels / ledger rows / documents. */
export const useLevels = (query) =>
  useQuery({
    queryKey: ['inventory', 'levels', query],
    queryFn: list('levels', query),
    placeholderData: keepPreviousData,
  });
export const useMovements = (query) =>
  useQuery({
    queryKey: ['inventory', 'movements', query],
    queryFn: list('movements', query),
    placeholderData: keepPreviousData,
  });
export const useOperations = (query) =>
  useQuery({
    queryKey: ['inventory', 'operations', query],
    queryFn: list('operations', query),
    placeholderData: keepPreviousData,
  });
export const useOperation = (id) =>
  useQuery({
    queryKey: ['inventory', 'operation', id],
    queryFn: () => apiData(`${BASE}/operations/${id}`),
    enabled: Boolean(id),
  });
/** One variant in every branch the user can see. */
export const useVariantLevels = (variantId) =>
  useQuery({
    queryKey: ['inventory', 'variant', variantId],
    queryFn: () => apiData(`${BASE}/variants/${variantId}/levels`),
    enabled: Boolean(variantId),
  });

/** Branches the user may pick in stock screens (no branch.view needed). */
export const useInventoryBranches = () =>
  useQuery({
    queryKey: ['inventory', 'branches'],
    queryFn: () => apiData(`${BASE}/branches`),
    staleTime: 60_000,
  });

/** Endpoint per dialog mode (a stock count is an adjustment with counted quantities). */
export const OPERATION_ENDPOINT = {
  adjust: 'adjust',
  count: 'adjust',
  transfer: 'transfer',
  receive: 'receive',
};

/** Books an operation; `idempotencyKey` makes retries of the same submit safe. */
export function useStockOperation(mode) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }) =>
      apiData(`${BASE}/${OPERATION_ENDPOINT[mode]}`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: (op) => toast.success(t('inventory.booked', { docNo: op.docNo })),
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}

export function useSetThreshold() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body) => apiData(`${BASE}/levels/threshold`, { method: 'PUT', body }),
    onSuccess: () => toast.success(t('common.saved')),
    onError: (err) => toast.error(errorMessage(t, err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}
