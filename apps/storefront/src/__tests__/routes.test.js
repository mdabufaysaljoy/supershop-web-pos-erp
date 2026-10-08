import { describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

describe('robots & sitemap', () => {
  it('robots disallows private areas in both languages and points to the sitemap', () => {
    const r = robots();
    expect(r.sitemap).toBe('https://shop.example/sitemap.xml');
    expect(r.rules.disallow).toEqual(
      expect.arrayContaining(['/checkout', '/ar/checkout', '/api/']),
    );
  });

  it('sitemap lists every language with hreflang alternates', () => {
    const entries = sitemap();
    expect(entries.map((e) => e.url)).toEqual(['https://shop.example/', 'https://shop.example/ar']);
    expect(entries[0].alternates.languages).toEqual({
      en: 'https://shop.example/',
      ar: 'https://shop.example/ar',
    });
  });
});

describe('getPublicSettings', () => {
  it('falls back to registry defaults when the API is unreachable (build never fails)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED')));
    const { getPublicSettings } = await import('@/lib/api');
    const s = await getPublicSettings();
    expect(s['store.name']).toBe('Supershop');
    expect(s['tax.vatRateBps']).toBe(1500);
    expect(s).not.toHaveProperty('tax.vatNumber'); // non-public never leaks via defaults
    vi.unstubAllGlobals();
  });

  it('merges API values over defaults and sends the language', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { 'store.name': 'Riyadh Mart' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { apiGet, getPublicSettings } = await import('@/lib/api');
    expect((await getPublicSettings())['store.name']).toBe('Riyadh Mart');
    await apiGet('/api/v1/x', { lang: 'ar', revalidate: 30, tags: ['t'] });
    const [url, init] = fetchMock.mock.calls.at(-1);
    expect(url).toBe('http://localhost:4000/api/v1/x?lang=ar');
    expect(init.headers['Accept-Language']).toBe('ar');
    expect(init.next).toEqual({ revalidate: 30, tags: ['t'] });
    vi.unstubAllGlobals();
  });
});
