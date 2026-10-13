import 'server-only';
import { cache } from 'react';
import { apiGet } from './api';

/**
 * Catalog reads for Server Components. Every call is per language (resolved strings) and cached
 * by Next (ISR, 60 s) + deduplicated within a render (`cache`). Tags allow on-demand
 * revalidation when the admin publishes changes (later).
 */

/** Public category tree; `[]` if the API is unreachable (pages still render). */
export const getCategoryTree = cache(async (lang) => {
  try {
    return (await apiGet('/api/v1/categories/public', { lang, tags: ['categories'] })).data ?? [];
  } catch {
    return [];
  }
});

/** Search/listing: `{ data: cards[], meta: { total, facets } }`. Throws on API errors. */
export const searchProducts = cache((lang, query) =>
  apiGet('/api/v1/search', { lang, query, tags: ['products'] }),
);

/** Product by slug, or null when it doesn't exist / isn't active. */
export const getProduct = cache(async (lang, slug) => {
  try {
    return (
      await apiGet(`/api/v1/products/public/${encodeURIComponent(slug)}`, {
        lang,
        tags: ['products'],
      })
    ).data;
  } catch (err) {
    if (err?.status === 404) return null;
    throw err;
  }
});

/** Formatter options the client needs to format prices like the server does. */
export const formatOptions = (lang, settings) => ({
  lang,
  digits: settings['i18n.digitStyle'],
  timeZone: settings['store.timeZone'],
  calendar: settings['store.calendarDisplay'],
  currency: settings['store.currency'],
});
