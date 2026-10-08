import { LOCALES, localizePath } from '@/i18n/config';
import { absoluteUrl } from '@/lib/site';

/**
 * sitemap.xml with per-language URLs and hreflang alternates (CLAUDE.md §5.4/§5.7).
 * Catalog/CMS URLs are appended as those modules ship (P3.1, P5.4); per-language/segmented
 * sitemaps via generateSitemaps when the catalog grows (P9.3).
 */
const STATIC_PATHS = ['/'];

export default function sitemap() {
  return STATIC_PATHS.flatMap((path) => {
    const languages = Object.fromEntries(
      LOCALES.map((l) => [l, absoluteUrl(localizePath(path, l))]),
    );
    return LOCALES.map((lang) => ({
      url: absoluteUrl(localizePath(path, lang)),
      changeFrequency: 'daily',
      priority: path === '/' ? 1 : 0.7,
      alternates: { languages },
    }));
  });
}
