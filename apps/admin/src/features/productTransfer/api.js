import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiData, downloadFile } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

const BASE = '/api/v1/product-transfers';
const KEYS = { jobs: ['productTransfers'], job: (id) => ['productTransfers', id] };
const RUNNING = new Set(['queued', 'running']);

export const useTransferJobs = () =>
  useQuery({
    queryKey: KEYS.jobs,
    queryFn: () => apiData(`${BASE}/jobs`),
    // Keep the list fresh while something is still running.
    refetchInterval: (q) => (q.state.data?.some((j) => RUNNING.has(j.status)) ? 2000 : false),
  });

/** One job, polled until it finishes. */
export const useTransferJob = (id) =>
  useQuery({
    queryKey: KEYS.job(id),
    queryFn: () => apiData(`${BASE}/jobs/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (RUNNING.has(q.state.data?.status) ? 1500 : false),
  });

function useStart(mutationFn) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.jobs }),
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

export const useStartImport = () =>
  useStart(({ file, mode, dryRun }) => {
    const body = new FormData();
    body.append('mode', mode);
    body.append('dryRun', String(dryRun));
    body.append('file', file);
    return apiData(`${BASE}/imports`, { method: 'POST', body });
  });

export const useStartExport = () =>
  useStart((body) => apiData(`${BASE}/exports`, { method: 'POST', body }));

export const downloadTemplate = (format) => downloadFile(`${BASE}/template`, { query: { format } });
export const downloadExport = (id) => downloadFile(`${BASE}/jobs/${id}/download`);
