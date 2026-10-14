/**
 * Redirect rules for the proxy (P5.5). The proxy runs on EVERY request, so this read is cached for
 * a minute, times out fast and keeps the last known rules — a stale redirect is better than a slow
 * site, and no rules at all is better than a failed request.
 *
 * Deliberately free of `server-only` and of the app's api client: the proxy cannot import either.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:4000';
const TTL_MS = 60_000;
let cache = { at: 0, value: [] };
let inflight = null;

export async function getRedirectRules() {
  if (Date.now() - cache.at < TTL_MS) return cache.value;
  inflight ??= fetch(`${API_INTERNAL_URL}/api/v1/site/redirects/public`, {
    signal: AbortSignal.timeout(500),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      cache = Array.isArray(body?.data)
        ? { at: Date.now(), value: body.data }
        : { ...cache, at: Date.now() };
      return cache.value;
    })
    .catch(() => {
      cache = { ...cache, at: Date.now() }; // keep what we had; retry after the TTL
      return cache.value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
