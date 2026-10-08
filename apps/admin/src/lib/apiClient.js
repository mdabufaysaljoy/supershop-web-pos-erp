import { CSRF_HEADER } from '@supershop/shared';
import { useAuthStore } from '@/features/auth/store';

/**
 * The ONLY way the admin talks to the API.
 * - Success envelope `{ data, meta? }` is returned as-is; errors throw ApiError with the stable
 *   machine `code` (UI maps it via `errors.<CODE>`), field `details`, and the server `requestId`.
 * - Expired access token → ONE shared refresh (concurrent requests wait on the same promise) →
 *   the request is retried once. Refresh failure → session cleared → guards send the user to login.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const REFRESH_PATH = '/api/v1/auth/staff/refresh';

export class ApiError extends Error {
  /** @param {{ status: number, code: string, message?: string, details?: unknown, requestId?: string }} p */
  constructor({ status, code, message, details, requestId }) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

async function toApiError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON (proxy error page, etc.)
  }
  const e = body?.error ?? {};
  return new ApiError({
    status: res.status,
    code: e.code ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
    message: e.message,
    details: e.details,
    requestId: e.requestId ?? res.headers.get('x-request-id') ?? undefined,
  });
}

async function send(url, init) {
  try {
    return await fetch(url, { credentials: 'include', ...init });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: err?.message });
  }
}

let refreshInFlight = null;

/**
 * Exchanges the refresh cookie for a new access token. Single-flight: concurrent callers share one
 * request (refresh tokens rotate — two parallel refreshes would trip reuse detection).
 * @returns {Promise<string | null>} new access token, or null (session over → store cleared)
 */
export function refreshAccessToken() {
  refreshInFlight ??= (async () => {
    try {
      const res = await send(`${BASE_URL}${REFRESH_PATH}`, {
        method: 'POST',
        headers: { [CSRF_HEADER]: '1' },
      });
      if (!res.ok) {
        useAuthStore.getState().clear();
        return null;
      }
      const { data } = await res.json();
      useAuthStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      // Network failure: keep the current state; the caller surfaces the error.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function buildUrl(path, query) {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * @param {string} path  e.g. '/api/v1/staff'
 * @param {{ method?: string, body?: unknown | FormData, query?: Record<string, unknown>, signal?: AbortSignal,
 *   auth?: boolean, headers?: Record<string, string>, responseType?: 'json' | 'blob' }} [opts]
 *   `auth: false` for login & public calls; `responseType: 'blob'` → `{ blob, fileName }`
 * @returns {Promise<{ data: any, meta?: any } | null>}  null for 204
 */
export async function api(
  path,
  { method = 'GET', body, query, signal, auth = true, headers = {}, responseType = 'json' } = {},
  retried = false,
) {
  const token = useAuthStore.getState().accessToken;
  // FormData (file uploads) is sent as-is: the browser sets the multipart boundary header.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await send(buildUrl(path, query), {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
      ...(auth && token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined || isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401 && auth) {
    const err = await toApiError(res);
    if (!retried && err.code === 'TOKEN_EXPIRED') {
      const fresh = await refreshAccessToken();
      if (fresh)
        return api(path, { method, body, query, signal, auth, headers, responseType }, true);
    } else if (['TOKEN_INVALID', 'UNAUTHENTICATED'].includes(err.code)) {
      useAuthStore.getState().clear();
    }
    throw err;
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return null;
  if (responseType === 'blob') {
    const disposition = res.headers.get('Content-Disposition') ?? '';
    return {
      blob: await res.blob(),
      fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download',
    };
  }
  return res.json();
}

/** Downloads a file endpoint (with auth/refresh) and saves it via a temporary link. */
export async function downloadFile(path, opts) {
  const { blob, fileName } = await api(path, { ...opts, responseType: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: returns only `data`. */
export const apiData = async (path, opts) => (await api(path, opts))?.data;
