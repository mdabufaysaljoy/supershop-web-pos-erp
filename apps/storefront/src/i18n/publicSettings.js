/**
 * Tiny cached read of public settings for the proxy (runs on every request, so it must never wait
 * long or fail the request). 60 s cache, 500 ms timeout, falls back to safe defaults.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:4000';
const TTL_MS = 60_000;
let cache = { at: 0, value: { 'i18n.autoDetect': false } };
let inflight = null;

export async function getProxySettings() {
  if (Date.now() - cache.at < TTL_MS) return cache.value;
  inflight ??= fetch(`${API_INTERNAL_URL}/api/v1/settings/public`, {
    signal: AbortSignal.timeout(500),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      if (body?.data) cache = { at: Date.now(), value: body.data };
      else cache = { ...cache, at: Date.now() };
      return cache.value;
    })
    .catch(() => {
      cache = { ...cache, at: Date.now() }; // keep last known values; retry after TTL
      return cache.value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
