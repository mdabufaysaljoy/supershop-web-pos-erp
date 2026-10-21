import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { apiData } from '@/lib/apiClient';

/**
 * Which branch this terminal is working in. The POS and the shift screens let the cashier pick it;
 * the app shell names it in the sidebar. It is kept in one store (mirrored to localStorage so the
 * terminal remembers it across reloads) rather than read from localStorage per screen, so every
 * part of the app agrees the moment it changes.
 */
const STORAGE_KEY = 'pos.branch';

const stored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

export const useActiveBranchStore = create((set) => ({
  branchId: stored(),
  setBranchId: (branchId) => {
    try {
      localStorage.setItem(STORAGE_KEY, branchId);
    } catch {
      // A locked-down browser just forgets the choice on reload.
    }
    set({ branchId });
  },
}));

/** The branches this staff member works in — readable by every signed-in user. */
export const useMyBranches = () =>
  useQuery({
    queryKey: ['branches', 'mine'],
    queryFn: () => apiData('/api/v1/branches/mine'),
    staleTime: 60_000,
  });

/**
 * The branch in use: what the cashier picked, or the only one they have.
 * @returns {{ branchId: string, branch: object | null, options: object[] }}
 */
export function useActiveBranch() {
  const chosen = useActiveBranchStore((s) => s.branchId);
  const { data } = useMyBranches();
  const options = data ?? [];
  const branchId = chosen || (options.length === 1 ? options[0].id : '');
  return { branchId, branch: options.find((b) => b.id === branchId) ?? null, options };
}
