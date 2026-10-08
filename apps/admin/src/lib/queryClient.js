import { QueryClient } from '@tanstack/react-query';

/** Server-state cache. Auth/permission errors are never retried; transient errors retry twice. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) =>
        err?.status !== 401 && err?.status !== 403 && err?.status !== 404 && count < 2,
    },
    mutations: { retry: false },
  },
});
