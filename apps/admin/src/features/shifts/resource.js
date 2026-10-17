import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { printRaw } from '@/lib/qz';

/**
 * Till shifts (P6.5): opening float, cash in/out, X-report during the day, and closing count with
 * an immutable Z-report on thermal paper.
 */
const BASE = '/api/v1/shifts';

export const SHIFT_KEYS = {
  all: ['shifts'],
  list: (query) => ['shifts', 'list', query],
  current: (branchId) => ['shifts', 'current', branchId ?? ''],
  detail: (id) => ['shifts', 'detail', id],
  xReport: (id) => ['shifts', 'x-report', id],
  zReport: (id) => ['shifts', 'z-report', id],
};

export const useShifts = (query = {}, options = {}) =>
  useQuery({
    queryKey: SHIFT_KEYS.list(query),
    queryFn: () => api(BASE, { query }),
    ...options,
  });

export const useCurrentShift = (branchId, { enabled = true } = {}) =>
  useQuery({
    queryKey: SHIFT_KEYS.current(branchId),
    queryFn: () => apiData(`${BASE}/current`, { query: branchId ? { branchId } : undefined }),
    enabled,
  });

export const useShiftXReport = (id, { enabled = true } = {}) =>
  useQuery({
    queryKey: SHIFT_KEYS.xReport(id),
    queryFn: () => apiData(`${BASE}/${id}/x-report`),
    enabled: Boolean(id && enabled),
  });

export const useShiftZReport = (id, { enabled = true } = {}) =>
  useQuery({
    queryKey: SHIFT_KEYS.zReport(id),
    queryFn: () => apiData(`${BASE}/${id}/z-report`),
    enabled: Boolean(id && enabled),
  });

function useShiftMutation(mutationFn, { success } = {}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: SHIFT_KEYS.all });
      if (success) toast.success(typeof success === 'function' ? success(data, t) : t(success));
    },
    onError: (err) => {
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
}

export const useOpenShift = () =>
  useShiftMutation((body) => apiData(`${BASE}/open`, { method: 'POST', body }), {
    success: 'shifts.openedToast',
  });

export const useRecordCashMovement = () =>
  useShiftMutation(({ id, body }) => apiData(`${BASE}/${id}/movements`, { method: 'POST', body }), {
    success: 'shifts.movementSaved',
  });

export const useCloseShift = () =>
  useShiftMutation(({ id, body }) => apiData(`${BASE}/${id}/close`, { method: 'POST', body }), {
    success: 'shifts.closedToast',
  });

export const usePrintShiftReport = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ id, kind, profileId }) => {
      const job = await apiData(`${BASE}/${id}/print`, {
        method: 'POST',
        body: { kind, ...(profileId ? { profileId } : {}) },
      });
      await printRaw(job);
      return job;
    },
    onSuccess: () => {
      toast.success(t('shifts.printedToast'));
    },
    onError: (err) => {
      toast.error(t('shifts.printFailed', { reason: err?.message ?? '' }));
    },
  });
};

export const useOpenCashDrawer = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ profileId } = {}) => {
      const job = await apiData(`${BASE}/drawer`, {
        method: 'POST',
        body: profileId ? { profileId } : {},
      });
      await printRaw(job);
      return job;
    },
    onSuccess: () => {
      toast.success(t('shifts.drawerOpened'));
    },
    onError: (err) => {
      toast.error(t('shifts.printFailed', { reason: err?.message ?? '' }));
    },
  });
};
