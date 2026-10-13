/**
 * Framework-free API client core (CLAUDE.md D-001: storefront data access goes through this, so a
 * frontend swap stays contained). Works in browsers, Node and Next.js server components.
 *
 * - Success envelope `{ data, meta? }` is returned as-is; 204 → null.
 * - Errors throw ApiError with the API's stable `code` (UI maps it to `errors.<CODE>`), field
 *   `details`, and `requestId` for support. Network failures → code NETWORK_ERROR (status 0).
 * - `extra` is passed through to fetch untouched (e.g. Next.js `{ next: { revalidate, tags } }`).
 */
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

/** @param {string} base @param {string} path @param {Record<string, unknown> | undefined} query */
export function buildApiUrl(base, path, query) {
  const url = `${base.replace(/\/+$/, '')}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error page (proxy/gateway)
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

/**
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, headers?: Record<string, string>,
 *   credentials?: RequestCredentials }} [opts]
 */
export function createApiClient({
  baseUrl = '',
  fetchImpl,
  headers: defaultHeaders = {},
  credentials,
} = {}) {
  /**
   * @param {string} path  '/api/v1/...'
   * @param {{ method?: string, query?: Record<string, unknown>, body?: unknown,
   *   headers?: Record<string, string>, signal?: AbortSignal, extra?: object }} [opts]
   */
  async function request(
    path,
    { method = 'GET', query, body, headers = {}, signal, extra = {} } = {},
  ) {
    const doFetch = fetchImpl ?? globalThis.fetch;
    let res;
    try {
      res = await doFetch(buildApiUrl(baseUrl, path, query), {
        method,
        signal,
        ...(credentials && { credentials }),
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...defaultHeaders,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        ...extra,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: err?.message });
    }
    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return null;
    return res.json();
  }

  return { request, get: (path, opts) => request(path, { ...opts, method: 'GET' }) };
}
