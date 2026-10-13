import { CSRF_HEADER } from '@supershop/shared';
import { eventBus } from '../src/core/events.js';

/** Allowed origin from vitest.config.js CORS_ORIGINS. */
export const ORIGIN = 'http://localhost:5173';

/** Headers a legitimate browser app sends on cookie-authenticated requests. */
export const csrfHeaders = { [CSRF_HEADER]: '1', Origin: ORIGIN };

/**
 * Extracts a cookie from a supertest response.
 * @returns {{ value: string, attrs: string } | null}
 */
export function getCookie(res, name) {
  const raw = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  if (!raw) return null;
  const [pair, ...attrs] = raw.split(';');
  return { value: decodeURIComponent(pair.slice(name.length + 1)), attrs: attrs.join(';').trim() };
}

/** Resolves with the next emitted event of `name` (event handlers run asynchronously). */
export function nextEvent(name, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout waiting for event ${name}`));
    }, timeoutMs);
    const off = eventBus.on(name, (e) => {
      clearTimeout(timer);
      off();
      resolve(e);
    });
  });
}

/** Polls `fn` until it returns a truthy value (for async side effects like audit writes). */
export async function waitFor(fn, { timeoutMs = 3_000, intervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
