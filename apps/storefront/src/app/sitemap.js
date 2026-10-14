import { DEFAULT_LOCALE, LOCALES, localizePath } from '@/i18n/config';
import { apiGet } from '@/lib/api';
import { categoryPath, flattenTree, productPath } from '@/lib/categories';
import { getSiteChrome } from '@/lib/chrome';
import { absoluteUrl } from '@/lib/site';

/**
 * sitemap.xml: every page in every language with hreflang alternates (CLAUDE.md §5.4/§5.7) —
 * home, categories, active products and the shop's own pages. Split into several sitemaps
 * (generateSitemaps) when the catalog outgrows one file (P9.3). Never fails: if the API is down
 * the static part is served and the next revalidation fills it in.
 *
 * A shop that has switched indexing off (P5.5) gets an EMPTY sitemap — robots.txt shuts crawlers
 * out, and a sitemap listing pages nobody may index would contradict it.
 */
export const revalidate = 3600;
const MAX_URLS = 45_000; // one sitemap file holds 50k URLs; leave room for languages × pages

const entry = (path, { priority, lastModified, changeFrequency = 'weekly' }) => {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(localizePath(path, l))]));
  languages['x-default'] = absoluteUrl(localizePath(path, DEFAULT_LOCALE));
  return LOCALES.map((lang) => ({
    url: absoluteUrl(localizePath(path, lang)),
    changeFrequency,
    priority,
    ...(lastModified && { lastModified }),
    alternates: { languages },
  }));
};

async function categoryPaths() {
  try {
    const tree = (await apiGet('/api/v1/categories/public', { revalidate: 3600 })).data ?? [];
    return flattenTree(tree).map(({ node }) => categoryPath(node.slug));
  } catch {
    return [];
  }
}

async function products() {
  const out = [];
  try {
    for (let page = 1; out.length * LOCALES.length < MAX_URLS; page += 1) {
      const res = await apiGet('/api/v1/products/public-sitemap', {
        query: { page },
        revalidate: 3600,
      });
      out.push(...res.data);
      if (res.data.length < res.meta.limit) break;
    }
  } catch {
    // keep what we have
  }
  return out;
}

/** The shop's published CMS pages (P5.5). */
async function cmsPages() {
  try {
    return (await apiGet('/api/v1/pages/public-sitemap', { revalidate: 3600 })).data ?? [];
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const [{ seo }, categories, items, pages] = await Promise.all([
    getSiteChrome('en'),
    categoryPaths(),
    products(),
    cmsPages(),
  ]);
  if (!seo.indexable) return [];
  return [
    ...entry('/', { priority: 1, changeFrequency: 'daily' }),
    ...categories.flatMap((path) => entry(path, { priority: 0.8, changeFrequency: 'daily' })),
    ...items.flatMap((p) =>
      entry(productPath(p.slug), { priority: 0.6, lastModified: p.updatedAt }),
    ),
    ...pages.flatMap((p) =>
      entry(`/p/${p.slug}`, {
        priority: 0.5,
        changeFrequency: 'monthly',
        lastModified: p.updatedAt,
      }),
    ),
  ].slice(0, MAX_URLS);
}
