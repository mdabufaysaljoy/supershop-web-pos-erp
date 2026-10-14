import { robotsPolicy, robotsTxt } from '@supershop/shared';
import { LOCALES } from '@/i18n/config';
import { getSiteChrome } from '@/lib/chrome';
import { absoluteUrl } from '@/lib/site';

/**
 * robots.txt, from the shop's own SEO settings (P5.5). It is written as a route rather than
 * through Next's metadata object so the lines a shop adds itself come out verbatim.
 *
 * Switching indexing off shuts crawlers out of everything — for a site that is not open yet, or a
 * copy of one. Private/transactional areas are always disallowed, in both languages (they are
 * `noindex` through page metadata too).
 */
export const revalidate = 60;
const PRIVATE = ['/cart', '/checkout', '/account', '/api/'];

export async function GET() {
  const { seo } = await getSiteChrome('en');
  const policy = robotsPolicy({
    indexable: seo.indexable,
    extra: seo.robotsExtra,
    privatePaths: PRIVATE,
    locales: LOCALES.filter((lang) => lang !== 'en'),
  });
  return new Response(
    robotsTxt(policy, { sitemap: seo.indexable ? absoluteUrl('/sitemap.xml') : null }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
