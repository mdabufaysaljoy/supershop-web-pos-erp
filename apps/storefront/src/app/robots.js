import { absoluteUrl } from '@/lib/site';

/**
 * robots.txt. Becomes admin-editable in P5.5. Private/transactional areas are disallowed in both
 * languages (they are also `noindex` via page metadata).
 */
const PRIVATE = ['/cart', '/checkout', '/account', '/api/'];

export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE, ...PRIVATE.map((p) => `/ar${p}`)] },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
