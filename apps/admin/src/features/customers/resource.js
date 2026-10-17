import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

const BASE = '/api/v1/customers';

export const customers = createResource('customers', BASE);

export const useCustomer = (id) =>
  useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => apiData(`${BASE}/${id}`),
    enabled: Boolean(id),
  });

export const useCustomerSegments = (query = {}) =>
  useQuery({
    queryKey: ['customers', 'segments', query],
    queryFn: () => apiData(`${BASE}/segments`, { query }),
  });

export function useUpdateCustomer(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body) => apiData(`${BASE}/${id}`, { method: 'PATCH', body }),
    onSuccess: (customer) => {
      qc.setQueryData(['customers', 'detail', id], customer);
      toast.success(t('common.saved'));
    },
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
