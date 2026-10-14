import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

const BASE = '/api/v1/orders';

/** Orders are never created or deleted from the admin — only read and moved along (P4.3). */
export const orders = createResource('orders', BASE);

export const useOrder = (id) =>
  useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => apiData(`${BASE}/${id}`),
    enabled: Boolean(id),
  });

/**
 * Everything the detail page does to an order: move it on, record a parcel, leave a note.
 * The server decides what is allowed; the page only offers what `nextActions` lists.
 */
export function useOrderAction(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ path, body }) => apiData(`${BASE}/${id}/${path}`, { method: 'POST', body }),
    onSuccess: (order) => {
      qc.setQueryData(['orders', 'detail', id], order);
      toast.success(t('common.saved'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}
