import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/i18n';
import * as api from './api';

export const MEDIA_KEYS = { all: ['media'], list: (q) => ['media', 'list', q] };

export const useMediaList = (query) =>
  useQuery({
    queryKey: MEDIA_KEYS.list(query),
    queryFn: () => api.fetchMedia(query),
    placeholderData: keepPreviousData,
  });

function useMediaMutation(mutationFn, success) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDIA_KEYS.all });
      if (success) toast.success(t(success));
    },
    onError: (err) => {
      if (err?.code !== 'VALIDATION_ERROR') toast.error(errorMessage(t, err));
    },
  });
}

export const useUpdateMedia = () =>
  useMediaMutation(({ id, body }) => api.updateMedia(id, body), 'common.saved');
export const useDeleteMedia = () => useMediaMutation(api.deleteMedia, 'common.deleted');

/**
 * Uploads files one after another (bounded server load, clear per-file status).
 * Returns the queue items `{ id, name, status: 'uploading'|'done'|'duplicate'|'error', error? }`.
 */
export function useUploadQueue() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationFn: async ({ files, onItem }) => {
      for (const [i, file] of files.entries()) {
        onItem(i, { status: 'uploading' });
        try {
          const res = await api.uploadMedia(file);
          onItem(i, { status: res?.meta?.duplicate ? 'duplicate' : 'done' });
        } catch (err) {
          onItem(i, { status: 'error', error: errorMessage(t, err) });
        }
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: MEDIA_KEYS.all }),
  });
  return mutation;
}
