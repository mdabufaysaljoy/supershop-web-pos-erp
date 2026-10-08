import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

/**
 * Standard REST resource (list/get/create/update/delete) → API functions + TanStack Query hooks.
 * Mutations toast success; errors with field `details` are left to the form (shown inline).
 * @param {string} key   query-key root, e.g. 'brands'
 * @param {string} base  e.g. '/api/v1/brands'
 */
export function createResource(key, base) {
  const keys = { all: [key], list: (q) => [key, 'list', q] };

  function useAction(mutationFn, success) {
    const qc = useQueryClient();
    const { t } = useTranslation();
    return useMutation({
      mutationFn,
      onSuccess: () => toast.success(t(success)),
      onError: (err) => {
        if (!err?.details?.length) toast.error(errorMessage(t, err));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: keys.all }),
    });
  }

  return {
    keys,
    /** @returns query whose data is `{ data, meta }` */
    useList: (query) =>
      useQuery({
        queryKey: keys.list(query),
        queryFn: () => api(base, { query }),
        placeholderData: keepPreviousData,
      }),
    useCreate: () => useAction((body) => apiData(base, { method: 'POST', body }), 'common.saved'),
    useUpdate: () =>
      useAction(
        ({ id, body }) => apiData(`${base}/${id}`, { method: 'PATCH', body }),
        'common.saved',
      ),
    useRemove: () =>
      useAction((id) => api(`${base}/${id}`, { method: 'DELETE' }), 'common.deleted'),
  };
}

/** API/zod details `[{ path, message }]` → `{ [field]: message }` (`rename` maps nested paths). */
export const detailsToErrors = (details = [], rename = {}) =>
  Object.fromEntries(details.map((d) => [rename[d.path] ?? d.path.split('.')[0], d.message]));

export const issuesToDetails = (issues) =>
  issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
