import { localizePath } from '@/i18n/config';
import { absoluteUrl, SITE_URL } from './site';

/**
 * JSON-LD builders (schema.org). Product/Offer/BreadcrumbList for catalog pages are added with
 * P3.1; these cover the site-wide entities.
 */

/** @param {{ name: string, logoUrl?: string, sameAs?: string[] }} p */
export const organizationLd = ({ name, logoUrl, sameAs }) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name,
  url: SITE_URL,
  ...(logoUrl && { logo: logoUrl }),
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
