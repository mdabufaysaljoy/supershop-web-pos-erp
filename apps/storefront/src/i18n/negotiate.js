import { DEFAULT_LOCALE, isLocale } from './config.js';

/**
 * Language negotiation for the proxy (pure; unit-tested).
 *
 * Rules (CLAUDE.md §5.7):
 * - An explicit choice (the `lang` cookie set by the switcher) is honored on English (unprefixed)
 *   document navigations → redirect to the same page in that language.
 * - Without a cookie, Accept-Language auto-detect runs ONLY when the admin setting is on.
 * - Never redirect bots/crawlers (each language URL must stay crawlable as-is), prefetches, or
 *   non-document requests. Explicit `/ar/...` URLs are never redirected to English.
 */
export const LANG_COOKIE = 'lang';
export const LANG_COOKIE_MAX_AGE = 365 * 24 * 3600;

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|whatsapp|telegram|slack|discord|lighthouse|pagespeed|headless|preview/i;

/** @param {string | null | undefined} ua */
export const isBot = (ua) => !ua || BOT_RE.test(ua);

/**
 * Highest-q supported language from an Accept-Language header ("ar-SA,ar;q=0.9,en;q=0.8").
 * @param {string | null | undefined} header
 * @param {readonly string[]} supported
 */
export function preferredLanguage(header, supported) {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
      return { base: tag.toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((x) => x.base && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return ranked.find((x) => supported.includes(x.base))?.base ?? null;
}

/**
 * @param {object} req
 * @param {string | null} req.routeLang   language from the URL (null = unprefixed English)
 * @param {string | undefined} req.cookieLang
 * @param {string | null} req.acceptLanguage
 * @param {string | null} req.userAgent
 * @param {boolean} req.isDocument        top-level page navigation (not prefetch/RSC/asset)
 * @param {boolean} req.autoDetect        admin setting i18n.autoDetect
 * @param {readonly string[]} req.locales
 * @returns {{ redirectTo: string, setCookie: boolean } | null}
 */
export function negotiateLanguage({
  routeLang,
  cookieLang,
  acceptLanguage,
  userAgent,
  isDocument,
  autoDetect,
  locales,
}) {
  if (routeLang !== null || !isDocument || isBot(userAgent)) return null;
  if (isLocale(cookieLang)) {
    return cookieLang === DEFAULT_LOCALE ? null : { redirectTo: cookieLang, setCookie: false };
  }
  if (!autoDetect) return null;
  const preferred = preferredLanguage(acceptLanguage, locales);
  if (!preferred || preferred === DEFAULT_LOCALE) return null;
  return { redirectTo: preferred, setCookie: true };
}
