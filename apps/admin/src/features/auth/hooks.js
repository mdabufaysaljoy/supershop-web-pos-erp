import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as authApi from './api';
import { useAuthStore } from './store';

/** Loads profile + access for the current token and stores the session. */
async function loadSession(accessToken) {
  const [profile, access] = await Promise.all([authApi.fetchProfile(), authApi.fetchAccess()]);
  useAuthStore.getState().setSession({ accessToken, profile, access });
}

/**
 * On app start: restore the session from the refresh cookie (silent refresh). Runs once.
 * Leaves status 'anonymous' when there is no valid session.
 */
export function useBootstrapSession() {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status !== 'unknown') return;
    let cancelled = false;
    (async () => {
      const token = await authApi.refreshAccessToken();
      if (cancelled) return;
      if (!token) return useAuthStore.getState().clear();
      try {
        await loadSession(token);
      } catch {
        useAuthStore.getState().clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);
  return status;
}

export function useLogin() {
  return useMutation({
    mutationFn: async (credentials) => {
      const data = await authApi.login(credentials);
      useAuthStore.getState().setAccessToken(data.accessToken);
      await loadSession(data.accessToken);
      return data;
    },
  });
}

export function useLogout({ everywhere = false } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => (everywhere ? authApi.logoutAll() : authApi.logout()),
    // Clear local state even if the server call fails (e.g. offline) — the user asked to leave.
    onSettled: () => {
      useAuthStore.getState().clear({ userInitiated: true });
      qc.clear();
    },
  });
}

/**
 * Keeps permissions fresh while the app is open (role edits apply without re-login):
 * refetched every 60 s and on window focus; the store updates on change.
 */
export function useAccessSync() {
  const enabled = useAuthStore((s) => s.status === 'authenticated');
  const query = useQuery({
    queryKey: ['auth', 'access'],
    queryFn: authApi.fetchAccess,
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (query.data) useAuthStore.getState().setAccess(query.data);
  }, [query.data]);
}
