import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/i18n';
import * as api from './api';
import { reorderLocally } from './tree';

export const CATEGORY_KEYS = { all: ['categories'] };

export const useCategories = () =>
  useQuery({ queryKey: CATEGORY_KEYS.all, queryFn: api.fetchCategories });

/** Errors with field details are shown inline by the form; everything else as a toast. */
function useCategoryMutation(mutationFn, success) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn,
    onSuccess: () => success && toast.success(t(success)),
    onError: (err) => {
      if (!err?.details?.length) toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CATEGORY_KEYS.all }),
  });
}

export const useCreateCategory = () => useCategoryMutation(api.createCategory, 'common.saved');
export const useUpdateCategory = () =>
  useCategoryMutation(({ id, body }) => api.updateCategory(id, body), 'common.saved');
export const useDeleteCategory = () => useCategoryMutation(api.deleteCategory, 'common.deleted');

/** Re-parent/reorder. Same-parent drags update the tree immediately and roll back on error. */
export function useMoveCategory() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, parentId, index }) => api.moveCategory(id, { parentId, index }),
    onMutate: async (move) => {
      await qc.cancelQueries({ queryKey: CATEGORY_KEYS.all });
      const previous = qc.getQueryData(CATEGORY_KEYS.all);
      if (previous) qc.setQueryData(CATEGORY_KEYS.all, reorderLocally(previous, move));
      return { previous };
    },
    onError: (err, _move, ctx) => {
      if (ctx?.previous) qc.setQueryData(CATEGORY_KEYS.all, ctx.previous);
      toast.error(errorMessage(t, err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CATEGORY_KEYS.all }),
  });
}
