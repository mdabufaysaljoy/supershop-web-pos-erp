import { DEFAULT_LOCALE, LOCALES, localizePath, OG_LOCALE } from '@/i18n/config';
import { absoluteUrl, SITE_URL } from './site';

/**
 * Builds Next.js Metadata for a page (CLAUDE.md §5.4 / §5.7):
 * - self-referencing canonical in the page's language;
 * - hreflang alternates for every language + x-default (English);
 * - Open Graph / Twitter cards with the right locale.
 * Filtered/paginated listings pass their canonical base `path` so variants don't compete.
 *
 * @param {object} p
 * @param {string} p.lang
 * @param {string} p.path   language-neutral path, e.g. '/' or '/products/blue-shirt'
 * @param {string} p.title
 * @param {string} [p.description]
 * @param {string} [p.siteName]
 * @param {{ url: string, width?: number, height?: number, alt?: string }[]} [p.images]
 * @param {'website' | 'article'} [p.type]
 * @param {boolean} [p.noindex]  e.g. cart, checkout, account, search results
 * @returns {import('next').Metadata}
 */
export function buildMetadata({
  lang,
  path,
  title,
  description,
  siteName,
  images,
  type = 'website',
  noindex = false,
}) {
  const canonical = localizePath(path, lang);
  const languages = Object.fromEntries(LOCALES.map((l) => [l, localizePath(path, l)]));
  languages['x-default'] = localizePath(path, DEFAULT_LOCALE);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      type,
      url: absoluteUrl(canonical),
      title,
      description,
      siteName,
      locale: OG_LOCALE[lang],
      alternateLocale: LOCALES.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
      ...(images?.length && { images }),
    },
    twitter: {
      card: images?.length ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(images?.length && { images: images.map((i) => i.url) }),
    },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
  };
}
