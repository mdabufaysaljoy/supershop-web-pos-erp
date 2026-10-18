import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

const BASE = '/api/v1/campaigns';

export const campaigns = createResource('campaigns', BASE);

export const useCampaign = (id) =>
  useQuery({
    queryKey: ['campaigns', 'detail', id],
    queryFn: () => apiData(`${BASE}/${id}`),
    enabled: Boolean(id),
  });

export const useAudienceCount = (segment, channel) =>
  useQuery({
    queryKey: ['campaigns', 'audience-count', segment, channel],
    queryFn: () => apiData(`${BASE}/audience-count`, { query: { segment, channel } }),
    enabled: Boolean(segment && channel),
  });

export const useCampaignDeliveries = (id, query = {}) =>
  useQuery({
    queryKey: ['campaigns', id, 'deliveries', query],
    queryFn: () => api(`${BASE}/${id}/deliveries`, { query }),
    enabled: Boolean(id),
  });

export function useScheduleCampaign(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body) => apiData(`${BASE}/${id}/schedule`, { method: 'POST', body }),
    onSuccess: (data) => {
      qc.setQueryData(['campaigns', 'detail', id], data);
      toast.success(t('campaigns.scheduledSuccess'));
    },
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useCancelCampaign(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => apiData(`${BASE}/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: (data) => {
      qc.setQueryData(['campaigns', 'detail', id], data);
      toast.success(t('campaigns.cancelledSuccess'));
    },
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useSendCampaign(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (opts = {}) =>
      apiData(`${BASE}/${id}/send${opts.inline ? '?inline=true' : ''}`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: (data) => {
      qc.setQueryData(['campaigns', 'detail', id], data);
      toast.success(t('campaigns.sendStarted'));
    },
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useSendTestCampaign(id) {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body) => apiData(`${BASE}/${id}/test`, { method: 'POST', body }),
    onSuccess: () => {
      toast.success(t('campaigns.testSentSuccess'));
    },
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
  });
}

const SUBSCRIBERS_BASE = '/api/v1/subscribers';

export const subscribers = createResource('subscribers', SUBSCRIBERS_BASE);

export function useUpdateSubscriber() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, status }) =>
      apiData(`${SUBSCRIBERS_BASE}/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      toast.success(t('common.saved'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

export function useDeleteSubscriber() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id) => apiData(`${SUBSCRIBERS_BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscribers'] });
      toast.success(t('common.deleted'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}
