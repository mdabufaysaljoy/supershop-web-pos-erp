import { describe, expect, it } from 'vitest';
import { buildMetadata } from '@/lib/seo';
import {
  breadcrumbLd,
  faqPageLd,
  itemListLd,
  organizationLd,
  productLd,
  serializeJsonLd,
  websiteLd,
} from '@/lib/structuredData';

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

  it('organizationLd formats absolute logo and social links', () => {
    const org = organizationLd({
      name: 'Riyadh Mart',
      logoUrl: '/media/logo.webp',
      sameAs: ['https://x.com/riyadhmart', 'https://instagram.com/riyadhmart'],
    });
    expect(org).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://shop.example/#organization',
      name: 'Riyadh Mart',
      url: 'https://shop.example',
      logo: 'https://shop.example/media/logo.webp',
      sameAs: ['https://x.com/riyadhmart', 'https://instagram.com/riyadhmart'],
    });
  });

  it('itemListLd constructs valid schema with localized absolute URLs', () => {
    const list = itemListLd({
      name: 'Summer Shirts',
      items: [
        { name: 'Linen Shirt', path: '/product/linen-shirt', image: '/media/linen.webp' },
        { name: 'Silk Shirt', path: '/product/silk-shirt' },
      ],
      lang: 'ar',
    });
    expect(list).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Summer Shirts',
      numberOfItems: 2,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Linen Shirt',
          url: 'https://shop.example/ar/product/linen-shirt',
          image: 'https://shop.example/media/linen.webp',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Silk Shirt',
          url: 'https://shop.example/ar/product/silk-shirt',
        },
      ],
    });
  });

  it('faqPageLd generates Question/Answer schema', () => {
    const faq = faqPageLd([
      { question: 'What is the delivery time?', answer: '1-3 business days across KSA.' },
      { question: 'Do you offer returns?', answer: 'Yes, 14-day free returns.' },
    ]);
    expect(faq).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is the delivery time?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '1-3 business days across KSA.',
          },
        },
        {
          '@type': 'Question',
          name: 'Do you offer returns?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, 14-day free returns.',
          },
        },
      ],
    });
  });

  it('productLd ensures absolute image URLs and seller info', () => {
    const p = {
      name: 'Classic Thobe',
      priceMin: 12000,
      priceMax: 12000,
      variants: [{ id: 'v1', sku: 'THOBE-WHT', price: 12000, inStock: true }],
      images: [{ id: 'img1', url: '/media/thobe-white.webp' }],
      inStock: true,
    };
    const ld = productLd({
      product: p,
      path: '/product/classic-thobe',
      lang: 'en',
      currency: 'SAR',
      sellerName: 'Saudi Traditional',
    });
    expect(ld.image).toEqual(['https://shop.example/media/thobe-white.webp']);
    expect(ld.offers).toMatchObject({
      '@type': 'Offer',
      price: '120.00',
      priceCurrency: 'SAR',
      seller: { '@type': 'Organization', name: 'Saudi Traditional' },
      availability: 'https://schema.org/InStock',
    });
  });
});
