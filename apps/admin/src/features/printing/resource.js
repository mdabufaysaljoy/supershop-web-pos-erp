import { useMutation, useQuery } from '@tanstack/react-query';
import { apiData } from '@/lib/apiClient';
import { printRaw } from '@/lib/qz';

/**
 * Printing from the admin (P6.3): the API decides what a receipt says and which printer it
 * belongs on; QZ Tray on this machine puts it on paper.
 */
const BASE = '/api/v1/printing';

/** Is printing set up at all, and should a sale print itself? */
export const usePrintingStatus = () =>
  useQuery({
    queryKey: ['printing', 'status'],
    queryFn: () => apiData(`${BASE}/status`),
    staleTime: 60_000,
  });

export const usePrinters = (query = {}) =>
  useQuery({
    queryKey: ['printing', 'profiles', query],
    queryFn: () => apiData(`${BASE}/profiles`, { query }),
    staleTime: 60_000,
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
