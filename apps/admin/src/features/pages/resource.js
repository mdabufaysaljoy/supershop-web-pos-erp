import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

const BASE = '/api/v1/pages';
export const pages = createResource('pages', BASE);

export const usePage = (id) =>
  useQuery({
    queryKey: ['pages', 'detail', id],
    queryFn: () => apiData(`${BASE}/${id}`),
    enabled: Boolean(id),
  });

/** Autosave: PATCHes the draft. Field errors stay in the response for the builder to show. */
export function useSaveDraft(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiData(`${BASE}/${id}`, { method: 'PATCH', body }),
    onSuccess: (page) => qc.setQueryData(['pages', 'detail', id], page),
  });
}

/** Publish / unpublish / restore a version. */
export function usePageAction(id) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (action) => apiData(`${BASE}/${id}/${action}`, { method: 'POST' }),
    onSuccess: (page) => {
      qc.setQueryData(['pages', 'detail', id], page);
      qc.invalidateQueries({ queryKey: ['pages'] });
      toast.success(t('common.saved'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}
