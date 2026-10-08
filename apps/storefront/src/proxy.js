import { NextResponse } from 'next/server';
import { resolveLocaleRoute } from './i18n/config.js';

/**
 * Locale routing at the edge of the app (Next.js 16 "proxy", formerly middleware).
 * - unprefixed (English) URLs are rewritten to the internal `/en/...` route;
 * - `/en/...` is permanently redirected to the unprefixed URL (canonical);
 * - `/ar/...` passes through.
 * Kept free of request-header reads in pages so routes stay statically renderable (ISR).
 */
export function proxy(request) {
  const route = resolveLocaleRoute(request.nextUrl.pathname);

  if (route.type === 'redirect') {
    const url = request.nextUrl.clone();
    url.pathname = route.pathname;
    return NextResponse.redirect(url, 308);
  }

  if (route.type === 'rewrite') {
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
