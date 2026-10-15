import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/i18n';
import * as api from './api';

/** Settings → Notifications (P4.5). */
const KEYS = { templates: ['notifications', 'templates'], logs: ['notifications', 'logs'] };

export const useTemplates = () =>
  useQuery({ queryKey: KEYS.templates, queryFn: api.fetchTemplates });

export const useNotificationLogs = () =>
  useQuery({ queryKey: KEYS.logs, queryFn: () => api.fetchLogs({ limit: 10 }) });

export function useUpdateTemplate() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.updateTemplate(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.templates });
      toast.success(t('common.saved'));
    },
    onError: (err) => {
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
}

/** A real message to an address the admin types — the only way to know mail actually works. */
export function useSendTest() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: api.sendTest,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: KEYS.logs });
      toast[result.status === 'sent' ? 'success' : 'error'](
        t(`notifications.test.${result.status}`),
      );
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}
