/**
 * LibreTranslate adapter (self-hosted, free — decision D-006).
 * API (docs.libretranslate.com): POST /translate { q, source, target, format, api_key? }
 *   → { translatedText }   ·   GET /health
 * Batch requests (q as array) are NOT documented, so each text is sent separately with bounded
 * concurrency. Transient failures (network, 429, 5xx) are retried with backoff.
 */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export class ProviderError extends Error {
  constructor(message, { status, retryable }) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs `fn` over items with at most `limit` in flight; preserves order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * @param {{ baseUrl: string, apiKey?: string | null, fetchImpl?: typeof fetch, timeoutMs?: number,
 *   retries?: number, concurrency?: number, backoffMs?: number }} opts
 */
export function createLibreTranslateProvider({
  baseUrl,
  apiKey = null,
  fetchImpl,
  timeoutMs = 15_000,
  retries = 2,
  concurrency = 4,
  backoffMs = 300,
}) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const doFetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  async function translateOne(text, { from, to }) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await sleep(backoffMs * 3 ** (attempt - 1));
      let res;
      try {
        res = await doFetch(`${base}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            q: text,
            source: from,
            target: to,
            format: 'text',
            ...(apiKey && { api_key: apiKey }),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        lastErr = new ProviderError(`LibreTranslate unreachable: ${err.message}`, {
          status: 0,
          retryable: true,
        });
        continue;
      }
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (typeof body?.translatedText !== 'string') {
          throw new ProviderError('LibreTranslate returned an unexpected body', {
            status: res.status,
            retryable: false,
          });
        }
        return body.translatedText;
      }
      const retryable = RETRYABLE.has(res.status);
      lastErr = new ProviderError(`LibreTranslate HTTP ${res.status}`, {
        status: res.status,
        retryable,
      });
      if (!retryable) break;
    }
    throw lastErr;
  }

  return {
    name: 'libretranslate',
    enabled: true,
    /** @param {string[]} texts */
    translateBatch: (texts, { from, to }) =>
      mapLimit(texts, concurrency, (t) => translateOne(t, { from, to })),
    async health() {
      try {
        const res = await doFetch(`${base}/health`, { signal: AbortSignal.timeout(3_000) });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
