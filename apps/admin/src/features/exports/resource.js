import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, apiData, downloadFile } from '@/lib/apiClient';
import { errorMessage } from '@/lib/i18n';

const BASE = '/api/v1/exports';
const KEYS = {
  jobs: (params) => ['exports', 'jobs', params],
  job: (id) => ['exports', 'job', id],
  resources: ['exports', 'resources'],
  presets: (resource) => ['exports', 'presets', resource],
};

const RUNNING = new Set(['queued', 'running']);

/**
 * List recent export jobs, auto-refreshed while jobs are in-flight.
 */
export function useExportJobs(params = {}) {
  return useQuery({
    queryKey: KEYS.jobs(params),
    queryFn: () => apiData(`${BASE}/jobs`, { query: params }),
    refetchInterval: (q) => {
      const list = Array.isArray(q.state.data) ? q.state.data : q.state.data?.data;
      return list?.some((j) => RUNNING.has(j.status)) ? 2000 : false;
    },
  });
}

/**
 * Single export job details, polled while queued/running.
 */
export function useExportJob(id) {
  return useQuery({
    queryKey: KEYS.job(id),
    queryFn: () => apiData(`${BASE}/jobs/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (RUNNING.has(q.state.data?.status) ? 1500 : false),
  });
}

/**
 * Metadata about exportable resources and column definitions.
 */
export function useExportResources() {
  return useQuery({
    queryKey: KEYS.resources,
    queryFn: () => apiData(`${BASE}/resources`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Start a new export background job.
 */
export function useStartExport() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (body) => apiData(BASE, { method: 'POST', body }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['exports'] });
      toast.success(t('export.notifications.started', { fileName: data.fileName }));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

/**
 * Download completed export file.
 */
export async function downloadExportJob(jobId) {
  return downloadFile(`${BASE}/jobs/${jobId}/download`);
}

/**
 * Saved report presets for the report builder.
 */
export function useReportPresets(resource = null) {
  const query = resource ? { resource } : undefined;
  return useQuery({
    queryKey: KEYS.presets(resource),
    queryFn: () => apiData(`${BASE}/presets`, { query }),
    staleTime: 60 * 1000,
  });
}

export function useSaveReportPreset() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (body) => apiData(`${BASE}/presets`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exports', 'presets'] });
      toast.success(t('export.presets.saved'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}

export function useDeleteReportPreset() {
  const qc = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id) => api(`${BASE}/presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exports', 'presets'] });
      toast.success(t('export.presets.deleted'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
}
