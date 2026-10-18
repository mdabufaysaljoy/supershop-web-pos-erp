/**
 * Public site origin for absolute URLs (canonical, hreflang, OG, sitemap). Set SITE_URL in
 * production (e.g. https://example.com); it must be the URL users and crawlers see.
 */
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** @param {string} path */
export const absoluteUrl = (path) => {
  if (!path) return SITE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};
