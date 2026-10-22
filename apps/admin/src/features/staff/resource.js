import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

/** Staff accounts (P0.5): who may sign in to the admin, and with which role. */
export const staff = createResource('staff', '/api/v1/staff');

/**
 * Signs a staff member out everywhere at once — the thing to do the moment a password is thought
 * to be known, or a phone with the till on it goes missing.
 */
export const useRevokeSessions = () => {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id) => api(`/api/v1/staff/${id}/sessions/revoke`, { method: 'POST' }),
    onSuccess: () => toast.success(t('staff.signedOutEverywhere')),
    onError: (err) => toast.error(errorMessage(t, err)),
    onSettled: () => qc.invalidateQueries({ queryKey: staff.keys.all }),
  });
};
