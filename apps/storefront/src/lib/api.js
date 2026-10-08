import 'server-only';
import { createApiClient, SETTINGS } from '@supershop/shared';

/**
 * Server-side API access for Server Components / metadata (SSR + ISR).
 * Uses the shared framework-free client; adds Next.js caching via `extra.next`.
 * Every content call sends the page language so the API returns resolved strings (CLAUDE.md §5.7).
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:4000';

export const api = createApiClient({ baseUrl: API_INTERNAL_URL });

/**
 * GET with ISR caching and language. `tags` let admin changes invalidate pages on demand later.
 * @param {string} path
 * @param {{ lang?: string, query?: Record<string, unknown>, revalidate?: number | false, tags?: string[] }} [opts]
 */
export function apiGet(path, { lang, query, revalidate = 60, tags } = {}) {
  return api.get(path, {
    query: lang ? { ...query, lang } : query,
    headers: lang ? { 'Accept-Language': lang } : {},
    extra: { next: { revalidate, ...(tags && { tags }) } },
  });
}

const PUBLIC_DEFAULTS = Object.freeze(
  Object.fromEntries(SETTINGS.filter((d) => d.public).map((d) => [d.key, d.default])),
);

/**
 * Public settings (store name, currency, VAT display, features…). Never throws: if the API is
 * unreachable (e.g. during `next build`), registry defaults are used and ISR retries later.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getPublicSettings() {
  try {
    const res = await apiGet('/api/v1/settings/public', { tags: ['settings'] });
    return { ...PUBLIC_DEFAULTS, ...res.data };
  } catch {
    return { ...PUBLIC_DEFAULTS };
  }
}
