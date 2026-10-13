import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

const BASE = '/api/v1/purchase-orders';
export const purchaseOrders = createResource('purchaseOrders', BASE);

export const usePurchaseOrder = (id) =>
  useQuery({
    queryKey: ['purchaseOrders', 'detail', id],
    queryFn: () => apiData(`${BASE}/${id}`),
    enabled: Boolean(id),
  });

/** Variant picker search (SKU prefix, barcode, product name). */
export const useVariantSearch = (q) =>
  useQuery({
    queryKey: ['variants', 'search', q],
    queryFn: () => apiData('/api/v1/products/variants', { query: { q, limit: 20 } }),
    enabled: q.length > 0,
  });

/**
 * Status actions: `order` | `close` | `cancel` | `receive`. Receive sends an Idempotency-Key so a
 * retried click/network retry can't book the same delivery twice. Field errors stay with the form.
 */
export function usePurchaseOrderAction(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ action, body = {}, idempotencyKey }) =>
      apiData(`${BASE}/${id}/${action}`, {
        method: 'POST',
        body,
        ...(idempotencyKey && { headers: { 'Idempotency-Key': idempotencyKey } }),
      }),
    onSuccess: () => toast.success(t('common.saved')),
    onError: (err) => {
      if (!err?.details?.length || err.code !== 'VALIDATION_ERROR')
        toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['purchaseOrders'] }),
  });
}
