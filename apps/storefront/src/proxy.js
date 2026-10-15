import { matchRedirect } from '@supershop/shared';
import { NextResponse } from 'next/server';
import { DEFAULT_LOCALE, LOCALES, resolveLocaleRoute } from './i18n/config.js';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, negotiateLanguage } from './i18n/negotiate.js';
import { getProxySettings } from './i18n/publicSettings.js';
import { getRedirectRules } from './lib/redirects.js';

/**
 * Locale routing at the edge of the app (Next.js 16 "proxy", formerly middleware).
 * - unprefixed (English) URLs are rewritten to the internal `/en/...` route;
 * - `/en/...` is permanently redirected to the unprefixed URL (canonical);
 * - `/ar/...` passes through;
 * - English document navigations may be redirected to the visitor's chosen/preferred language
 *   (see i18n/negotiate.js). Those redirects are private + uncacheable.
 * It also applies the shop's own redirects (P5.5) BEFORE locale routing: a moved address answers
 * once, in the visitor's language, instead of rendering and redirecting later.
 * Kept free of request-header reads in pages so routes stay statically renderable (ISR).
 */
export async function proxy(request) {
  const { pathname, search } = request.nextUrl;

  const moved = matchRedirect(await getRedirectRules(), `${pathname}${search}`, {
    locales: LOCALES,
    defaultLocale: DEFAULT_LOCALE,
  });
  if (moved) {
    // 410: the shop says the page is gone for good — answered here, not rendered as a 404.
    if (!moved.to) return new NextResponse(null, { status: 410 });
    const target = moved.to.startsWith('/') ? new URL(moved.to, request.nextUrl) : moved.to;
    return NextResponse.redirect(target, moved.status);
  }

  const route = resolveLocaleRoute(pathname);

  if (route.type === 'redirect') {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.redirect(url, 308);
  }

  if (route.type === 'rewrite') {
    const h = request.headers;
    const isDocument =
      request.method === 'GET' &&
      h.get('sec-fetch-dest') !== 'empty' &&
      !h.get('rsc') &&
      !h.get('next-router-prefetch') &&
      (h.get('sec-fetch-dest') === 'document' || (h.get('accept') ?? '').includes('text/html'));
    const cookieLang = request.cookies.get(LANG_COOKIE)?.value;
    // Only consult settings when it can matter (no explicit choice, real navigation).
    const autoDetect =
      isDocument && !cookieLang ? Boolean((await getProxySettings())['i18n.autoDetect']) : false;

    const decision = negotiateLanguage({
      routeLang: null,
      cookieLang,
      acceptLanguage: h.get('accept-language'),
      userAgent: h.get('user-agent'),
      isDocument,
      autoDetect,
      locales: LOCALES,
    });
    if (decision) {
      const url = request.nextUrl.clone();
      url.pathname =
        pathname === '/' ? `/${decision.redirectTo}` : `/${decision.redirectTo}${pathname}`;
      url.search = search;
      const res = NextResponse.redirect(url, 307);
      res.headers.set('Cache-Control', 'private, no-store');
      res.headers.set('Vary', 'Cookie, Accept-Language');
      if (decision.setCookie) {
        res.cookies.set(LANG_COOKIE, decision.redirectTo, {
          path: '/',
          maxAge: LANG_COOKIE_MAX_AGE,
          sameSite: 'lax',
        });
      }
      return res;
    }

    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip API proxying, Next internals and any file with an extension (robots.txt, sitemap.xml, images…).
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
};
