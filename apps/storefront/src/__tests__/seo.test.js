import { describe, expect, it } from 'vitest';
import { buildMetadata } from '@/lib/seo';
import { breadcrumbLd, serializeJsonLd, websiteLd } from '@/lib/structuredData';

describe('buildMetadata', () => {
  it('self-canonical + hreflang pairs + x-default (English page)', () => {
    const m = buildMetadata({
      lang: 'en',
      path: '/products/x',
      title: 'X',
      description: 'd',
      siteName: 'S',
    });
    expect(m.alternates).toEqual({
      canonical: '/products/x',
      languages: { en: '/products/x', ar: '/ar/products/x', 'x-default': '/products/x' },
    });
    expect(m.metadataBase.href).toBe('https://shop.example/');
    expect(m.openGraph).toMatchObject({
      url: 'https://shop.example/products/x',
      locale: 'en_SA',
      alternateLocale: ['ar_SA'],
    });
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.twitter.card).toBe('summary');
  });

  it('Arabic page canonicalizes to /ar and x-default stays English', () => {
    const m = buildMetadata({ lang: 'ar', path: '/', title: 'X' });
    expect(m.alternates.canonical).toBe('/ar');
    expect(m.alternates.languages['x-default']).toBe('/');
    expect(m.openGraph.locale).toBe('ar_SA');
  });

  it('noindex for private pages; large card with images', () => {
    const m = buildMetadata({
      lang: 'en',
      path: '/cart',
      title: 'Cart',
      noindex: true,
      images: [{ url: '/og.png' }],
    });
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: ['/og.png'] });
  });
});

describe('structured data', () => {
  it('serializeJsonLd neutralizes </script> injection and line separators', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script> & \u2028x\u2029' });
    expect(out).not.toMatch(/<|>|&|\u2028|\u2029/);
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script> & \u2028x\u2029');
  });

  it('WebSite SearchAction and breadcrumbs use localized absolute URLs', () => {
    expect(websiteLd({ name: 'S', lang: 'ar' }).potentialAction.target.urlTemplate).toBe(
      'https://shop.example/ar/search?q={search_term_string}',
    );
    expect(
      breadcrumbLd(
        [
          { name: 'Home', path: '/' },
          { name: 'Phones', path: '/c/phones' },
        ],
        'ar',
      ).itemListElement,
    ).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://shop.example/ar' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Phones',
        item: 'https://shop.example/ar/c/phones',
      },
    ]);
  });
});
