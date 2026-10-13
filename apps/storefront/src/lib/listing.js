import { SEARCH } from '@supershop/shared';

/**
 * Product listing URL state (category, search and "all products" pages) — pure and unit-tested.
 * URL params are short and human-readable; prices are whole SAR in the URL, halalas in the API:
 *   ?q=shirt&sort=price_asc&brands=<id>,<id>&min=50&max=200&page=2
 * Anything invalid is dropped (never an error page): crawlers and hand-edited URLs stay safe.
 */

export const PAGE_SIZE = 24;
const OBJECT_ID = /^[a-f\d]{24}$/i;
const SORTS = new Set(SEARCH.SORTS);

const first = (v) => (Array.isArray(v) ? v[0] : v);
const wholeNumber = (v, max) => {
  const s = first(v);
  if (typeof s !== 'string' || !/^\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n <= max ? n : null;
};

/**
 * @param {Record<string, string | string[] | undefined>} params  Next.js `searchParams`
 * @returns {{ q: string, sort: string | null, brands: string[], min: number | null,
 *   max: number | null, page: number, category: string | null }}
 */
export function parseListing(params = {}) {
  const q = String(first(params.q) ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 100);
  const sort = SORTS.has(first(params.sort)) ? first(params.sort) : null;
  // `brands` arrives as "a,b" (links) or repeated `brands=a&brands=b` (the filter form).
  const brandParam = [params.brands ?? []].flat().join(',');
  const brands = [...new Set(brandParam.split(',').filter((id) => OBJECT_ID.test(id)))]
    .slice(0, SEARCH.MAX_BRANDS)
    .sort();
  let min = wholeNumber(params.min, 10_000_000);
  let max = wholeNumber(params.max, 10_000_000);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  const page = wholeNumber(params.page, 500) || 1;
  const category = OBJECT_ID.test(first(params.category) ?? '') ? first(params.category) : null;
  return { q, sort, brands, min, max, page, category };
}

/** True when the visitor narrowed or re-sorted the list (such URLs aren't indexed). */
export const isRefined = (l) =>
  Boolean(l.q || l.sort || l.brands.length || l.min != null || l.max != null || l.category);

/**
 * Search API query for a listing. `base` adds fixed filters (e.g. the page's category).
 * @param {ReturnType<typeof parseListing>} l
 */
export function toSearchQuery(l, base = {}) {
  return {
    ...(l.q && { q: l.q }),
    ...(l.sort && { sort: l.sort }),
    ...(l.brands.length && { brands: l.brands.join(',') }),
    ...(l.min != null && { minPrice: l.min * 100 }),
    ...(l.max != null && { maxPrice: l.max * 100 }),
    ...(l.category && { categoryId: l.category }),
    page: l.page,
    limit: PAGE_SIZE,
    ...base,
  };
}

/**
 * URL of a listing state. `patch` changes some keys; any change other than `page` resets to
 * page 1. Defaults (page 1, no sort, no filters) are omitted, so equal states share one URL.
 * @param {string} path  already localized, e.g. '/ar/category/phones'
 */
export function listingHref(path, l, patch = {}) {
  const next = { ...l, ...patch };
  if (!('page' in patch)) next.page = 1;
  const qs = new URLSearchParams();
  if (next.q) qs.set('q', next.q);
  if (next.category) qs.set('category', next.category);
  if (next.brands?.length) qs.set('brands', [...next.brands].sort().join(','));
  if (next.min != null) qs.set('min', String(next.min));
  if (next.max != null) qs.set('max', String(next.max));
  if (next.sort) qs.set('sort', next.sort);
  if (next.page > 1) qs.set('page', String(next.page));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** Page count for a result total. */
export const pageCount = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));

/**
 * The filter form submits empty fields (`?min=&max=`); such URLs are redirected to the clean
 * equivalent so each listing state has exactly one URL.
 */
export const hasEmptyParams = (params = {}) =>
  Object.values(params).some((v) => [v].flat().some((x) => x === ''));
