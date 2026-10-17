import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { printRaw } from '@/lib/qz';

/**
 * Printing from the admin (P6.3 & P6.4): the API decides what a receipt or label says and which
 * printer it belongs on; QZ Tray on this machine puts it on paper.
 */
const BASE = '/api/v1/printing';

const KEYS = {
  status: ['printing', 'status'],
  profiles: ['printing', 'profiles'],
  templates: ['printing', 'templates'],
};

/** Is printing set up at all, and should a sale print itself? */
export const usePrintingStatus = () =>
  useQuery({
    queryKey: KEYS.status,
    queryFn: () => apiData(`${BASE}/status`),
    staleTime: 60_000,
  });

export const usePrinters = (query = {}) =>
  useQuery({
    queryKey: [...KEYS.profiles, query],
    queryFn: () => apiData(`${BASE}/profiles`, { query }),
    staleTime: 60_000,
  });

export const usePrintingTemplates = () =>
  useQuery({
    queryKey: KEYS.templates,
    queryFn: () => apiData(`${BASE}/templates`),
  });

function usePrintingAction(mutationFn, { invalidate = [], success } = {}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key });
      if (success) toast.success(typeof success === 'function' ? success(data, t) : t(success));
    },
    onError: (err) => {
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
}

export const useCreatePrinter = () =>
  usePrintingAction((body) => apiData(`${BASE}/profiles`, { method: 'POST', body }), {
    invalidate: [KEYS.profiles],
    success: 'common.saved',
  });

export const useUpdatePrinter = () =>
  usePrintingAction(
    ({ id, body }) => apiData(`${BASE}/profiles/${id}`, { method: 'PATCH', body }),
    {
      invalidate: [KEYS.profiles],
      success: 'common.saved',
    },
  );

export const useDeletePrinter = () =>
  usePrintingAction((id) => api(`${BASE}/profiles/${id}`, { method: 'DELETE' }), {
    invalidate: [KEYS.profiles],
    success: 'common.deleted',
  });

export const useUpdateReceiptTemplate = () =>
  usePrintingAction((body) => apiData(`${BASE}/templates/receipt`, { method: 'PATCH', body }), {
    invalidate: [KEYS.templates],
    success: 'common.saved',
  });

export const useUpdateLabelTemplate = () =>
  usePrintingAction((body) => apiData(`${BASE}/templates/label`, { method: 'PATCH', body }), {
    invalidate: [KEYS.templates],
    success: 'common.saved',
  });

/** Fetches an order's receipt and sends it to its printer. */
export const usePrintReceipt = () =>
  useMutation({
    mutationFn: async ({ orderId, profileId }) => {
      const job = await apiData(`${BASE}/receipt/${orderId}`, {
        query: profileId ? { profileId } : undefined,
      });
      await printRaw(job);
      return job;
    },
  });

/** Builds a barcode label job and sends it to the label printer. */
export const usePrintLabel = () =>
  useMutation({
    mutationFn: async (body) => {
      const job = await apiData(`${BASE}/label`, { method: 'POST', body });
      await printRaw(job);
      return job;
    },
  });
