import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/i18n';
import * as api from './api';

const KEYS = {
  settings: (group) => ['settings', group],
  overview: ['i18n', 'overview'],
  glossary: ['i18n', 'glossary'],
  overrides: (lang) => ['i18n', 'uiOverrides', lang],
};

export const useLanguageSettings = () =>
  useQuery({ queryKey: KEYS.settings('languages'), queryFn: () => api.fetchSettings('languages') });
/** Any settings group, cached per group. */
export const useSettings = (group) =>
  useQuery({ queryKey: KEYS.settings(group), queryFn: () => api.fetchSettings(group) });

/** The payments group: gateway choice and its (masked) keys — P4.2. */
export const usePaymentSettings = () => useSettings('payments');
export const useI18nOverview = () =>
  useQuery({ queryKey: KEYS.overview, queryFn: api.fetchI18nOverview, refetchInterval: 15_000 });
export const useGlossary = () => useQuery({ queryKey: KEYS.glossary, queryFn: api.fetchGlossary });
export const useUiOverrides = (lang) =>
  useQuery({ queryKey: KEYS.overrides(lang), queryFn: () => api.fetchUiOverrides(lang) });

/** Mutation with standard success/error toasts and cache invalidation. */
function useAction(mutationFn, { invalidate = [], success } = {}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key });
      if (success) toast.success(typeof success === 'function' ? success(data, t) : t(success));
    },
    onError: (err) => {
      // Field-level validation errors are shown inline by the form; others as a toast.
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
}

export const useSaveSettings = () =>
  useAction(api.saveSettings, {
    invalidate: [['settings'], KEYS.overview, ['printing', 'status'], ['printing', 'templates']],
    success: 'common.saved',
  });
export const useTestProvider = () => useAction(api.testProvider);

export const useCreateGlossaryTerm = () =>
  useAction(api.createGlossaryTerm, { invalidate: [KEYS.glossary], success: 'common.saved' });
export const useUpdateGlossaryTerm = () =>
  useAction(({ id, body }) => api.updateGlossaryTerm(id, body), {
    invalidate: [KEYS.glossary],
    success: 'common.saved',
  });
export const useDeleteGlossaryTerm = () =>
  useAction(api.deleteGlossaryTerm, { invalidate: [KEYS.glossary], success: 'common.deleted' });

export const useSaveUiOverride = (lang) =>
  useAction(({ key, body }) => api.saveUiOverride(lang, key, body), {
    invalidate: [KEYS.overrides(lang)],
    success: 'common.saved',
  });
export const useDeleteUiOverride = (lang) =>
  useAction((key) => api.deleteUiOverride(lang, key), {
    invalidate: [KEYS.overrides(lang)],
    success: 'languages.ui.reverted',
  });

export const useRetranslate = () =>
  useAction(api.retranslate, {
    invalidate: [KEYS.overview],
    success: (data, t) => t('languages.queue.scheduled', { count: data.scheduled }),
  });
export const useRetryJob = () =>
  useAction(api.retryJob, { invalidate: [KEYS.overview], success: 'languages.queue.retried' });
export const useRetryAllFailed = () =>
  useAction(api.retryAllFailed, {
    invalidate: [KEYS.overview],
    success: 'languages.queue.retried',
  });

/**
 * The settings any signed-in user may read (`settings/public`). The till needs one of them — may a
 * customer have a phone number from outside the Kingdom — and a cashier has no `settings.view`.
 */
export const usePublicSettings = () =>
  useQuery({
    queryKey: ['settings', 'public'],
    queryFn: api.fetchPublicSettings,
    staleTime: 5 * 60_000,
  });
