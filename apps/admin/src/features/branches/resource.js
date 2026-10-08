import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';
import { createResource } from '@/lib/resource';

export const branches = createResource('branches', '/api/v1/branches');

const staffKey = (branchId) => ['branches', 'staff', branchId];

/** Staff assigned to a branch. */
export const useBranchStaff = (branchId) =>
  useQuery({
    queryKey: staffKey(branchId),
    queryFn: () => apiData(`/api/v1/branches/${branchId}/staff`),
  });

/** Staff search for the "assign" picker (needs `staff.view`). */
export const useStaffSearch = (q, { enabled = true } = {}) =>
  useQuery({
    queryKey: ['staff', 'search', q],
    queryFn: () =>
      apiData('/api/v1/staff', { query: { limit: 20, status: 'active', ...(q && { q }) } }),
    enabled,
  });

/** Assign (`assigned: true`) or unassign a staff member; refreshes counts and lists. */
export function useAssignment(branchId) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ staffId, assigned }) =>
      assigned
        ? api(`/api/v1/branches/${branchId}/staff`, { method: 'POST', body: { staffId } })
        : api(`/api/v1/branches/${branchId}/staff/${staffId}`, { method: 'DELETE' }),
    onSuccess: () => toast.success(t('common.saved')),
    onError: (err) => toast.error(errorMessage(t, err)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}
