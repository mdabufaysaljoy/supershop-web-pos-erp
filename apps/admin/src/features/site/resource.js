import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

/** The site's chrome (P5.4): menus, announcement bar, footer and theme tokens. */
const BASE = '/api/v1/site';
const KEYS = { menus: ['site', 'menus'], layout: ['site', 'layout'] };

export const useMenus = () =>
  useQuery({ queryKey: KEYS.menus, queryFn: () => apiData(`${BASE}/menus`) });

export const useMenu = (id) =>
  useQuery({
    queryKey: [...KEYS.menus, id],
    queryFn: () => apiData(`${BASE}/menus/${id}`),
    enabled: Boolean(id),
  });

export const useLayout = () =>
  useQuery({ queryKey: KEYS.layout, queryFn: () => apiData(`${BASE}/layout`) });

/** Shared mutation wiring: toast on success, field errors left to the form. */
function useSiteMutation(mutationFn, { invalidate = KEYS.menus, success = 'common.saved' } = {}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: () => toast.success(t(success)),
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: invalidate });
      qc.invalidateQueries({ queryKey: ['site'] });
    },
  });
}

export const useCreateMenu = () =>
  useSiteMutation((body) => apiData(`${BASE}/menus`, { method: 'POST', body }));

export const useUpdateMenu = (id) =>
  useSiteMutation((body) => apiData(`${BASE}/menus/${id}`, { method: 'PATCH', body }));

export const useDeleteMenu = () =>
  useSiteMutation((id) => api(`${BASE}/menus/${id}`, { method: 'DELETE' }), {
    success: 'common.deleted',
  });

export const useUpdateLayout = () =>
  useSiteMutation((body) => apiData(`${BASE}/layout`, { method: 'PATCH', body }), {
    invalidate: KEYS.layout,
  });
