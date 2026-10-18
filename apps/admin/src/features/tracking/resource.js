import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

const BASE = '/api/v1/tracking';
const KEYS = {
  all: ['tracking'],
  integrations: ['tracking', 'integrations'],
};

export function useTrackingIntegrations() {
  return useQuery({
    queryKey: KEYS.integrations,
    queryFn: () => apiData(BASE),
    staleTime: 60 * 1000,
  });
}

export function useUpdateTrackingIntegration() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ provider, ...body }) =>
      apiData(`${BASE}/${provider}`, {
        method: 'PUT',
        body,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success(t('tracking.notifications.saved', { provider: vars.provider.toUpperCase() }));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

export function useUpdateConsentSettings() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (body) =>
      apiData(`${BASE}/settings/consent`, {
        method: 'PUT',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      toast.success(t('tracking.notifications.consentSaved'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}
