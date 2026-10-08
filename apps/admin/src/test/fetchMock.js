import { vi } from 'vitest';

/** JSON Response helper. */
export const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/**
 * Installs a fetch mock routed by "METHOD path" → handler(request) returning a Response
 * (or a function for dynamic answers). Unmatched calls fail loudly.
 */
export function mockFetch(routes) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const u = new URL(url, 'http://localhost');
    const key = `${init.method ?? 'GET'} ${u.pathname}`;
    calls.push({ key, url: u, init });
    const handler = routes[key];
    if (!handler) throw new Error(`Unmocked fetch: ${key}`);
    return typeof handler === 'function' ? handler({ url: u, init, calls }) : handler.clone();
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls, count: (key) => calls.filter((c) => c.key === key).length };
}
