import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/i18n';
import * as api from './api';

/** Payment methods (P4.2) — the shop's own list, cached under one key. */
const KEY = ['payment-methods'];

export const usePaymentMethods = () =>
  useQuery({ queryKey: KEY, queryFn: api.fetchPaymentMethods });

function useAction(mutationFn, success) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      if (success) toast.success(t(success));
    },
    onError: (err) => {
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
}

export const useCreateMethod = () => useAction(api.createPaymentMethod, 'payments.methods.created');
export const useUpdateMethod = () =>
  useAction(({ id, ...body }) => api.updatePaymentMethod(id, body), 'payments.methods.saved');
export const useDeleteMethod = () => useAction(api.deletePaymentMethod, 'payments.methods.deleted');
export const useReorderMethods = () => useAction(api.reorderPaymentMethods);
