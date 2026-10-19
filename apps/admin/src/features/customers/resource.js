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

export function useIssueLoyaltyCard(customerId) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body) =>
      apiData(`/api/v1/loyalty/customers/${customerId}/issue-card`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', 'detail', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success(
        t('customers.detail.loyaltyCard.issuedSuccess', 'Loyalty card issued successfully'),
      );
    },
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
  });
}

export const lookupLoyaltyCard = (q) =>
  apiData('/api/v1/loyalty/lookup', { query: { q: String(q).trim() } });
