import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as robots } from '@/app/robots.txt/route';
import sitemap from '@/app/sitemap';

/** The chrome read both files need; `seo` is what P5.5 made admin-editable. */
const chrome = (seo = {}) => ({
  data: {
    announcement: { enabled: false, text: '', href: '', tone: 'primary' },
    header: { showCategoryRow: true, menu: [] },
    footer: { note: '', menus: [] },
    theme: {},
    brand: { logo: null, favicon: null, ogImage: null },
    contact: {},
    social: [],
    seo: { titleSuffix: '', defaultDescription: '', indexable: true, robotsExtra: '', ...seo },
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('robots & sitemap', () => {
  const json = (data, meta = {}) =>
    new Response(JSON.stringify({ data, meta }), {
      headers: { 'Content-Type': 'application/json' },
    });
  /** Answers the API calls both files make; `seo` steers the shop's SEO settings. */
  const stubApi = ({ seo = {}, categories = [], products = [], pages = [] } = {}) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = new URL(url);
        if (u.pathname === '/api/v1/site/public') return json(chrome(seo).data);
        if (u.pathname === '/api/v1/categories/public') return json(categories);
        if (u.pathname === '/api/v1/pages/public-sitemap') return json(pages);
        if (u.pathname === '/api/v1/products/public-sitemap')
          return json(products, { page: 1, limit: 5000 });
        throw new Error(`unexpected ${u}`);
      }),
    );

  it('robots disallows private areas in both languages and points to the sitemap', async () => {
    stubApi();
    const text = await (await robots()).text();
    expect(text).toContain('Sitemap: https://shop.example/sitemap.xml');
    for (const line of ['Disallow: /checkout', 'Disallow: /ar/checkout', 'Disallow: /api/'])
      expect(text).toContain(line);
  });

  it('robots shuts everything out, and the sitemap empties, when indexing is off (P5.5)', async () => {
    stubApi({ seo: { indexable: false, robotsExtra: 'Disallow: /tmp' } });
    const text = await (await robots()).text();
    expect(text).toContain('Disallow: /');
    expect(text).not.toContain('Sitemap:');
    expect(text).toContain('Disallow: /tmp'); // the shop's own line, verbatim
    expect(await sitemap()).toEqual([]);
  });

  it('sitemap lists home, categories, products and the shop’s pages, with hreflang', async () => {
    stubApi({
      categories: [
        { id: '1', slug: 'fashion', children: [{ id: '2', slug: 'shirts', children: [] }] },
      ],
      products: [{ slug: 'oxford', updatedAt: '2026-10-01T00:00:00.000Z' }],
      pages: [{ slug: 'about-us', updatedAt: '2026-09-01T00:00:00.000Z' }],
    });
    const entries = await sitemap();
    expect(entries.map((e) => e.url)).toEqual([
      'https://shop.example/',
      'https://shop.example/ar',
      'https://shop.example/category/fashion',
      'https://shop.example/ar/category/fashion',
      'https://shop.example/category/shirts',
      'https://shop.example/ar/category/shirts',
      'https://shop.example/product/oxford',
      'https://shop.example/ar/product/oxford',
      'https://shop.example/p/about-us',
      'https://shop.example/ar/p/about-us',
    ]);
    expect(entries[0].alternates.languages).toEqual({
      en: 'https://shop.example/',
      ar: 'https://shop.example/ar',
      'x-default': 'https://shop.example/',
    });
    expect(entries.at(-1).lastModified).toBe('2026-09-01T00:00:00.000Z');
  });

  it('sitemap still renders the static part when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('ECONNREFUSED')));
    const entries = await sitemap();
    vi.unstubAllGlobals();
    expect(entries.map((e) => e.url)).toEqual(['https://shop.example/', 'https://shop.example/ar']);
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
