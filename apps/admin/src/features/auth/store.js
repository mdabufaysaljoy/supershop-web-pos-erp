import { create } from 'zustand';

/**
 * Session state. The access token lives ONLY in memory (never localStorage — XSS-safe); the
 * refresh token is an httpOnly cookie the browser sends to /api/v1/auth/staff/* automatically.
 * After a page reload the session is restored with a silent refresh (useBootstrapSession).
 *
 * status: 'unknown' (bootstrapping) | 'authenticated' | 'anonymous'
 * signedOut: true after a DELIBERATE sign-out — guards then go to plain /login (no `next`), so the
 *   next person on a shared terminal doesn't land on the previous user's page.
 */
export const useAuthStore = create((set) => ({
  status: 'unknown',
  accessToken: null,
  profile: null,
  /** { permissions: string[], isSuperAdmin, allBranches, branchIds, roleId } from /staff/me/access */
  access: null,
  signedOut: false,

  setAccessToken: (accessToken) => set({ accessToken }),
  setSession: ({ accessToken, profile, access }) =>
    set((s) => ({
      status: 'authenticated',
      accessToken: accessToken ?? s.accessToken,
      profile,
      access,
    })),
  setAccess: (access) => set({ access }),
  /** @param {{ userInitiated?: boolean }} [opts] */
  clear: ({ userInitiated = false } = {}) =>
    set({
      status: 'anonymous',
      accessToken: null,
      profile: null,
      access: null,
      signedOut: userInitiated,
    }),
}));
