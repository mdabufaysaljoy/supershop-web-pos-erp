import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

const BASE = '/api/v1/tracking';
const KEYS = {
  all: ['tracking'],
  integrations: ['tracking', 'integrations'],
  logs: (params) => ['tracking', 'logs', params],
  log: (id) => ['tracking', 'logs', id],
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

export function useTrackingLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.provider && params.provider !== 'all') query.set('provider', params.provider);
  if (params.event && params.event !== 'all') query.set('event', params.event);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);

  const qs = query.toString();
  const url = qs ? `${BASE}/logs?${qs}` : `${BASE}/logs`;

  return useQuery({
    queryKey: KEYS.logs(params),
    queryFn: () => apiData(url),
    staleTime: 10 * 1000,
  });
}

export function useTrackingLog(id) {
  return useQuery({
    queryKey: KEYS.log(id),
    queryFn: () => apiData(`${BASE}/logs/${id}`),
    enabled: Boolean(id),
  });
}

export function useRetryTrackingLog() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id) =>
      apiData(`${BASE}/logs/${id}/retry`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracking', 'logs'] });
      toast.success(t('tracking.notifications.retried'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

export function useDispatchTestEvent() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (body) =>
      apiData(`${BASE}/test`, {
        method: 'POST',
        body,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tracking', 'logs'] });
      if (res?.success) {
        toast.success(t('tracking.notifications.testSuccess'));
      } else {
        toast.error(t('tracking.notifications.testFailed'));
      }
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}
