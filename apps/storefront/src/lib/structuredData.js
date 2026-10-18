import { fromMinor } from '@supershop/shared';
import { localizePath } from '@/i18n/config';
import { absoluteUrl, SITE_URL } from './site';

/**
 * JSON-LD builders (schema.org): site-wide entities, breadcrumbs and Product/Offer (P3.1).
 */

/** @param {{ name: string, logoUrl?: string, sameAs?: string[] }} p */
export const organizationLd = ({ name, logoUrl, sameAs }) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name,
  url: SITE_URL,
  ...(logoUrl && { logo: absoluteUrl(logoUrl) }),
  ...(sameAs?.length && { sameAs }),
});

/** WebSite with sitelinks SearchAction (search page arrives in P3.1). */
export const websiteLd = ({ name, lang }) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name,
  url: absoluteUrl(localizePath('/', lang)),
  inLanguage: lang,
  publisher: { '@id': `${SITE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${absoluteUrl(localizePath('/search', lang))}?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
});

/** @param {{ name: string, path: string }[]} items  @param {string} lang */
export const breadcrumbLd = (items, lang) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: absoluteUrl(localizePath(item.path, lang)),
  })),
});

/**
 * ItemList schema for category and collection pages (Google Carousel / ItemList rich results).
 * @param {{ name: string, items: { name: string, path: string, image?: string }[], lang: string }} p
 */
export const itemListLd = ({ name, items = [], lang }) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name,
  numberOfItems: items.length,
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    url: absoluteUrl(localizePath(item.path, lang)),
    ...(item.image && { image: absoluteUrl(item.image) }),
  })),
});

/**
 * FAQPage schema for FAQ questions (Google Rich Snippets).
 * @param {{ question: string, answer: string }[]} questions
 */
export const faqPageLd = (questions = []) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: questions
    .filter((q) => q?.question && q?.answer)
    .map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
});

const AVAILABILITY = { true: 'https://schema.org/InStock', false: 'https://schema.org/OutOfStock' };

/**
 * Product with Offer (one price) or AggregateOffer (variants with different prices). Prices are
 * the displayed ones (major units, 2 decimals). Availability only when known.
 * @param {{ product: object, path: string, lang: string, currency: string, sellerName?: string }} p
 */
export function productLd({ product: p, path, lang, currency, sellerName }) {
  const url = absoluteUrl(localizePath(path, lang));
  const availability = p.inStock == null ? undefined : AVAILABILITY[p.inStock];
  const major = (minor) => fromMinor(minor);
  const single = p.variants?.length === 1 ? p.variants[0] : null;
  const seller = { '@type': 'Organization', name: sellerName || 'SuperShop' };
  const priceValidUntil = `${new Date().getFullYear() + 1}-12-31`;

  const offers =
    single || p.priceMin === p.priceMax
      ? {
          '@type': 'Offer',
          url,
          price: major(p.priceMin),
          priceCurrency: currency,
          priceValidUntil,
          itemCondition: 'https://schema.org/NewCondition',
          seller,
          ...(availability && { availability }),
        }
      : {
          '@type': 'AggregateOffer',
          url,
          lowPrice: major(p.priceMin),
          highPrice: major(p.priceMax),
          offerCount: p.variants?.length || 1,
          priceCurrency: currency,
          priceValidUntil,
          itemCondition: 'https://schema.org/NewCondition',
          seller,
          ...(availability && { availability }),
          ...(p.variants?.length > 1 && {
            offers: p.variants.map((v) => ({
              '@type': 'Offer',
              url: `${url}?variant=${v.id}`,
              sku: v.sku,
              price: major(v.price),
              priceCurrency: currency,
              priceValidUntil,
              itemCondition: 'https://schema.org/NewCondition',
              seller,
              ...((v.inStock ?? p.inStock) != null && {
                availability: AVAILABILITY[v.inStock ?? p.inStock],
              }),
            })),
          }),
        };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    url,
    inLanguage: lang,
    ...((p.shortDescription || p.description) && {
      description: (p.shortDescription || p.description).slice(0, 5000),
    }),
    ...(p.images?.length && { image: p.images.map((i) => absoluteUrl(i.url)) }),
    ...(single && { sku: single.sku }),
    ...(p.brand && { brand: { '@type': 'Brand', name: p.brand.name } }),
    offers,
  };
}

// Built at runtime: some compilers inline `/\u2028/` as a raw line separator inside the regex
// literal, which breaks the bundle ("Invalid regular expression: missing /").
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

/**
 * Serializes JSON-LD safely for an inline <script>: escapes characters that could close the tag
 * or break parsing (`</script>` injection via product names etc.).
 * @param {unknown} data
 */
export const serializeJsonLd = (data) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replaceAll(LINE_SEP, '\\u2028')
    .replaceAll(PARA_SEP, '\\u2029');
