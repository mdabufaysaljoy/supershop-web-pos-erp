import { getSearchAdapter } from '../../adapters/search/index.js';
import { indexTokens, queryTerms } from '../../adapters/search/text.js';
import { logger } from '../../core/logger.js';
import { getBrandsByIds } from '../brands/index.js';
import { listCategories } from '../categories/index.js';
import { resolveDoc } from '../i18n/index.js';
import { getIndexSources, getPublicCards, productIdBatches } from '../products/index.js';

/**
 * Product search (P1.8). This module turns products into search documents (name, brand, category
 * path names, tags, option labels, descriptions, SKUs/barcodes — English AND Arabic) and keeps
 * the index in sync from domain events. The engine is behind `adapters/search`.
 */

const BATCH = 100;
const text = (ls) => [ls?.en, ls?.ar].filter(Boolean);

/** id → { name, parentId, slug } for every category (small; loaded per indexing batch). */
async function categoryIndex() {
  const list = await listCategories();
  return new Map(list.map((c) => [c.id, c]));
}

function categoryPath(ids, categories) {
  const path = new Set();
  for (const id of ids) {
    for (let c = categories.get(id); c && !path.has(c.id); c = categories.get(c.parentId))
      path.add(c.id);
  }
  return [...path];
}

/** Search documents for products (deleted/missing ones are returned in `remove`). */
async function buildDocs(ids) {
  const sources = await getIndexSources(ids);
  const categories = await categoryIndex();
  const brandIds = [...new Set(sources.map((s) => s.brandId).filter(Boolean))];
  const brands = new Map(
    (brandIds.length ? await getBrandsByIds(brandIds) : []).map((b) => [b.id, b]),
  );
  const found = new Set(sources.map((s) => s.id));
  const remove = ids.filter((id) => !found.has(id));
  const docs = [];
  for (const s of sources) {
    if (s.deleted) {
      remove.push(s.id);
      continue;
    }
    const path = categoryPath(s.categoryIds, categories);
    docs.push({
      id: s.id,
      status: s.status,
      categoryPath: path,
      brandId: s.brandId,
      priceMin: s.priceMin,
      priceMax: s.priceMax,
      createdAt: s.createdAt,
      popularity: 0, // best-sellers feed this later (P8)
      fields: {
        name: { en: s.name.en ?? '', ...(s.name.ar && { ar: s.name.ar }) },
        keywords: [
          brands.get(s.brandId)?.name,
          ...path.flatMap((id) => text(categories.get(id)?.name)),
          ...s.tags,
          ...s.options.flatMap((o) => [...text(o.name), ...o.values.flatMap((v) => text(v.label))]),
        ].filter(Boolean),
        body: [...text(s.shortDescription), ...text(s.description)],
        codes: s.codes,
      },
    });
  }
  return { docs, remove };
}

/** Re-indexes the given products now (batched). */
export async function reindexProducts(ids) {
  const adapter = getSearchAdapter();
  for (let i = 0; i < ids.length; i += BATCH) {
    const { docs, remove } = await buildDocs(ids.slice(i, i + BATCH));
    await adapter.upsert(docs);
    await adapter.remove(remove);
  }
}

// One rebuild at a time; per-product re-indexing is coalesced (several events → one write).
let rebuilding = null;
let lastRebuild = null;
const pending = new Set();
let flushing = null;

/** Schedules products for re-indexing (deduplicated, runs right after the current tick). */
export function scheduleReindex(ids) {
  for (const id of ids) pending.add(String(id));
  flushing ??= (async () => {
    try {
      while (pending.size) {
        const batch = [...pending].slice(0, BATCH);
        batch.forEach((id) => pending.delete(id));
        await reindexProducts(batch);
      }
    } catch (err) {
      logger.error({ err: { message: err.message } }, 'search re-index failed');
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Re-index every product of a brand, or of a category AND its whole subtree (paths change). */
export async function reindexWhere({ brandId, categoryId }) {
  if (brandId) {
    for await (const ids of productIdBatches({ brandId })) await reindexProducts(ids);
    return;
  }
  const categories = await categoryIndex();
  const inSubtree = (c) => {
    for (let x = c; x; x = categories.get(x.parentId)) if (x.id === categoryId) return true;
    return false;
  };
  for (const c of categories.values()) {
    if (!inSubtree(c)) continue;
    for await (const ids of productIdBatches({ categoryId: c.id })) await reindexProducts(ids);
  }
}

/**
 * Full rebuild without downtime: every product is (re)written in place, then documents of products
 * that no longer exist are pruned — searches keep working throughout.
 */
export function rebuildIndex() {
  rebuilding ??= (async () => {
    const started = new Date();
    try {
      const adapter = getSearchAdapter();
      const seen = [];
      for await (const ids of productIdBatches({})) {
        await reindexProducts(ids);
        seen.push(...ids);
      }
      await adapter.retainOnly(seen);
      const count = seen.length;
      lastRebuild = { at: new Date(), products: count, ms: Date.now() - started.getTime() };
      logger.info(lastRebuild, 'search index rebuilt');
      return lastRebuild;
    } finally {
      rebuilding = null;
    }
  })();
  return rebuilding;
}

/** Builds the index once if it's empty (first start / new engine). */
export async function ensureSearchIndex() {
  const adapter = getSearchAdapter();
  if ((await adapter.count()) > 0) return;
  for await (const ids of productIdBatches({})) {
    if (ids.length) void rebuildIndex();
    break;
  }
}

export async function indexStatus() {
  const adapter = getSearchAdapter();
  return {
    driver: adapter.name,
    documents: await adapter.count(),
    rebuilding: Boolean(rebuilding),
    lastRebuild,
  };
}

// ---------------------------------------------------------------- queries

/**
 * Storefront search (also used without `q` for filtered listings).
 * @param {{ q?: string, categoryId?: string, brandIds?: string[], minPrice?: number, maxPrice?: number,
 *   sort?: string, page: number, limit: number }} query
 * @param {string} lang
 */
export async function searchProducts(query, lang) {
  const { q, page, limit, sort, ...filters } = query;
  const result = await getSearchAdapter().search({ q, filters, sort, page, limit, lang });
  const [items, categories, brands] = await Promise.all([
    getPublicCards(result.ids, lang),
    categoryIndex(),
    result.facets?.brands.length ? getBrandsByIds(result.facets.brands.map((b) => b.id)) : [],
  ]);
  const brandById = new Map(brands.filter((b) => b.isActive).map((b) => [b.id, b]));
  const facets = result.facets && {
    brands: result.facets.brands
      .filter((b) => brandById.has(b.id))
      .map((b) => ({ ...b, name: brandById.get(b.id).name, slug: brandById.get(b.id).slug })),
    categories: result.facets.categories
      .filter((c) => categories.get(c.id)?.isActive)
      .map((c) => {
        const cat = resolveDoc(categories.get(c.id), ['name'], lang);
        return { ...c, name: cat.name, slug: cat.slug, parentId: cat.parentId };
      }),
    price: result.facets.price,
  };
  return { items, total: result.total, facets };
}

/** Typeahead: up to 6 products + 3 categories whose names start with the typed words. */
export async function suggest(q, lang) {
  const [products, categories] = await Promise.all([
    getSearchAdapter().suggest({ q, lang, limit: 6 }),
    categoryIndex(),
  ]);
  const terms = queryTerms(q);
  const categoryHits = [...categories.values()]
    .filter((c) => c.isActive)
    .map((c) => ({ c, name: resolveDoc(c, ['name'], lang).name }))
    .filter(({ c }) => {
      const words = indexTokens(`${c.name.en} ${c.name.ar ?? ''}`);
      return terms.length && terms.every((t) => words.some((w) => w.startsWith(t)));
    })
    .slice(0, 3)
    .map(({ c, name }) => ({ type: 'category', id: c.id, slug: c.slug, text: name }));
  const cards = await getPublicCards(
    products.map((p) => p.id),
    lang,
  );
  return [
    ...cards.map((p) => ({
      type: 'product',
      id: p.id,
      slug: p.slug,
      text: p.name,
      image: p.image?.thumbUrl ?? null,
      priceMin: p.priceMin,
    })),
    ...categoryHits,
  ];
}
