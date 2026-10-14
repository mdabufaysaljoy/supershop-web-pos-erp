import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** P5.5 — the shop's redirects, answered at the edge before anything renders. */
const RULES = [
  { from: '/old-offer', to: '/search?sort=newest', status: 301 },
  { from: '/moved', to: '/p/about-us', status: 302 },
  { from: '/gone', to: '', status: 410 },
];

vi.mock('@/i18n/publicSettings', () => ({
  getProxySettings: async () => ({ 'i18n.autoDetect': false }),
}));
const rules = vi.fn(async () => RULES);
vi.mock('@/lib/redirects', () => ({ getRedirectRules: () => rules() }));

const { proxy } = await import('@/proxy');

/** A request shaped the way Next hands one to the proxy (nextUrl is clonable, cookies is a store). */
const ask = (url) => {
  const nextUrl = new URL(url);
  nextUrl.clone = () => new URL(url);
  return proxy(
    Object.assign(new Request(url, { method: 'GET' }), {
      nextUrl,
      cookies: { get: () => undefined },
    }),
  );
};

beforeEach(() => rules.mockClear());
afterEach(() => vi.clearAllMocks());

describe('redirects at the edge', () => {
  it('sends a moved address to its new home, permanently', async () => {
    const res = await ask('http://shop.test/old-offer');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('http://shop.test/search?sort=newest');
  });

  it('keeps an Arabic visitor in Arabic', async () => {
    const res = await ask('http://shop.test/ar/moved');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://shop.test/ar/p/about-us');
  });

  it('answers "gone" for a page the shop retired, without rendering a 404', async () => {
    const res = await ask('http://shop.test/gone');
    expect(res.status).toBe(410);
  });

  it('leaves every other address to the locale routing', async () => {
    const res = await ask('http://shop.test/search');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/en/search');
  });
});
