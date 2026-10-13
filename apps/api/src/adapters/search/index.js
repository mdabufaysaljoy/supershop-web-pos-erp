import { config } from '../../core/config.js';
import { createMongoSearch } from './mongo.js';

/**
 * Search adapters (CLAUDE.md P1.8). The search module builds documents; adapters store and query
 * them. Swapping to Meilisearch / Typesense / Atlas Search = new file + a branch below.
 *
 * Interface:
 *   {
 *     name: string,
 *     upsert(docs: SearchDoc[]): Promise<void>,
 *     remove(ids: string[]): Promise<void>,
 *     clear(): Promise<void>,
 *     retainOnly(ids: string[]): Promise<void>,   // prune after a full rebuild
 *     count(): Promise<number>,
 *     search(q: SearchQuery): Promise<{ ids: string[], total: number, facets: Facets }>,
 *     suggest({ q: string, lang: string, limit: number }): Promise<{ id: string, text: string }[]>,
 *   }
 *
 * SearchDoc: { id, status, categoryPath: string[], brandId, priceMin, priceMax, createdAt,
 *   popularity, sortName, fields: { name: { en, ar? }, keywords: string[], body: string[],
 *   codes: string[] } } — `keywords` = brand/category/tags/option labels, `codes` = SKUs/barcodes.
 * SearchQuery: { q?, lang, filters: { categoryId?, brandIds?, minPrice?, maxPrice?, status? },
 *   sort: 'relevance'|'newest'|'price_asc'|'price_desc'|'name', page, limit }.
 */
export function createSearchAdapter({ driver }) {
  switch (driver) {
    case 'mongo':
      return createMongoSearch();
    default:
      throw new Error(`Unknown search driver: ${driver}`);
  }
}

let instance = null;
export function getSearchAdapter() {
  instance ??= createSearchAdapter({ driver: config.SEARCH_DRIVER });
  return instance;
}
export function setSearchAdapter(adapter) {
  instance = adapter;
}
