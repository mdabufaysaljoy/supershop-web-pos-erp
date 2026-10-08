import { isRtl, LANGUAGES, SOURCE_LANGUAGE } from '@supershop/shared';

/**
 * Locale routing (CLAUDE.md D-007): English (default) has NO prefix; Arabic lives under `/ar`.
 *   /products/x   → en   (served internally from /en/products/x by proxy.js)
 *   /ar/products/x → ar
 *   /en/products/x → 308 → /products/x   (one URL per page: no duplicate content)
 * Adding a language = add it to LANGUAGES in @supershop/shared + a dictionary (CLAUDE.md §5.7).
 * Edge-safe: imported by proxy.js, so keep it free of Node/React APIs.
 */
export const LOCALES = Object.freeze(Object.values(LANGUAGES));
export const DEFAULT_LOCALE = SOURCE_LANGUAGE;

/** @param {unknown} lang */
export const isLocale = (lang) => typeof lang === 'string' && LOCALES.includes(lang);

/** @param {string} lang */
export const dirOf = (lang) => (isRtl(lang) ? 'rtl' : 'ltr');

/** Open Graph locale codes. */
export const OG_LOCALE = Object.freeze({ en: 'en_SA', ar: 'ar_SA' });

/**
 * Splits a public pathname into { lang, path } (path always starts with '/').
 * @param {string} pathname
 */
export function splitLocale(pathname) {
  const [, first, ...rest] = pathname.split('/');
  if (isLocale(first)) return { lang: first, path: `/${rest.join('/')}` };
  return { lang: null, path: pathname || '/' };
}

/**
 * Public URL path for `path` in `lang`: localizePath('/p/x', 'ar') → '/ar/p/x'; en → '/p/x'.
 * @param {string} path  must start with '/'
 * @param {string} lang
 */
export function localizePath(path, lang) {
  const clean = path === '' ? '/' : path;
  if (lang === DEFAULT_LOCALE) return clean;
  return clean === '/' ? `/${lang}` : `/${lang}${clean}`;
}

/**
 * Routing decision for the proxy (pure, unit-tested).
 * @param {string} pathname
 * @returns {{ type: 'next', lang: string } | { type: 'rewrite', lang: string, pathname: string }
 *   | { type: 'redirect', pathname: string }}
 */
export function resolveLocaleRoute(pathname) {
  const { lang, path } = splitLocale(pathname);
  if (lang === DEFAULT_LOCALE)
    return { type: 'redirect', pathname: path.length > 1 ? path.replace(/\/+$/, '') : '/' };
  if (lang) return { type: 'next', lang };
  return {
    type: 'rewrite',
    lang: DEFAULT_LOCALE,
    pathname: `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`,
  };
}
