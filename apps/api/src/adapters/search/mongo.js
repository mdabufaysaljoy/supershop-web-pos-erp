import mongoose from 'mongoose';
import { indexTokens, normalizeText, queryTerms } from './text.js';

/**
 * MongoDB search adapter: a denormalized `search_documents` collection with normalized tokens
 * (multikey index; anchored-prefix regex queries use it) and filter fields. Relevance is scored in
 * the app over at most MAX_CANDIDATES matches — right for catalogs up to tens of thousands of
 * products; beyond that, switch the adapter (e.g. Meilisearch/Atlas Search).
 */
const MAX_CANDIDATES = 1000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const schema = new mongoose.Schema(
  {
    _id: { type: String },
    status: String,
    categoryPath: [String],
    brandId: { type: String, default: null },
    priceMin: Number,
    priceMax: Number,
    popularity: { type: Number, default: 0 },
    sortName: String,
    createdAt: Date,
    /** All searchable tokens (union) — the query index. */
    tokens: [String],
    /** Per-field tokens for scoring. */
    nameTokens: [String],
    keywordTokens: [String],
    codes: [String],
    /** Display text for suggestions, per language. */
    names: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: 'search_documents', versionKey: false },
);
schema.index({ tokens: 1 });
schema.index({ codes: 1 });
schema.index({ status: 1, categoryPath: 1 });
schema.index({ status: 1, brandId: 1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ status: 1, priceMin: 1 });
const SearchDocument = mongoose.models.SearchDocument ?? mongoose.model('SearchDocument', schema);

const SORTS = {
  newest: { createdAt: -1, _id: 1 },
  price_asc: { priceMin: 1, _id: 1 },
  price_desc: { priceMax: -1, _id: 1 },
  name: { sortName: 1, _id: 1 },
  relevance: { popularity: -1, createdAt: -1, _id: 1 },
};

function toStored(doc) {
  const name = [doc.fields.name.en, doc.fields.name.ar].filter(Boolean).join(' ');
  const nameTokens = indexTokens(name);
  const keywordTokens = indexTokens(doc.fields.keywords.join(' '));
  const bodyTokens = indexTokens(doc.fields.body.join(' '));
  const codes = doc.fields.codes.map((c) => c.toLowerCase());
  return {
    _id: doc.id,
    status: doc.status,
    categoryPath: doc.categoryPath,
    brandId: doc.brandId,
    priceMin: doc.priceMin,
    priceMax: doc.priceMax,
    popularity: doc.popularity ?? 0,
    sortName: normalizeText(doc.fields.name.en),
    createdAt: doc.createdAt,
    tokens: [...new Set([...nameTokens, ...keywordTokens, ...bodyTokens, ...codes])],
    nameTokens,
    keywordTokens,
    codes,
    names: doc.fields.name,
  };
}

/** Whole query as a code (SKU/barcode as typed or scanned), normalized like stored codes. */
const asCode = (q) => normalizeText(q).trim();

/** Mongo filter for structured filters (+ every term must prefix-match some token). */
function buildFilter({ filters = {} }, terms, omit, code) {
  const f = { status: filters.status ?? 'active' };
  if (filters.categoryId && omit !== 'category') f.categoryPath = filters.categoryId;
  if (filters.brandIds?.length && omit !== 'brand') f.brandId = { $in: filters.brandIds };
  if (omit !== 'price') {
    if (filters.minPrice != null) f.priceMax = { $gte: filters.minPrice };
    if (filters.maxPrice != null) f.priceMin = { $lte: filters.maxPrice };
  }
  if (terms.length) {
    const words = { $and: terms.map((t) => ({ tokens: { $regex: `^${escapeRegex(t)}` } })) };
    // An exact SKU/barcode qualifies on its own (codes like "LT-1" split into weak words).
    f.$or = code ? [words, { codes: code }] : [words];
  }
  return f;
}

/**
 * Field-weighted relevance: exact SKU/barcode ≫ name > codes > keywords (brand/category/tags/
 * options) > description.
 */
function score(doc, terms, code) {
  let total = code && doc.codes.includes(code) ? 50 : 0;
  const has = (list, t, exact) => list.some((x) => (exact ? x === t : x.startsWith(t)));
  for (const t of terms) {
    if (has(doc.codes, t, true)) total += 12;
    else if (has(doc.nameTokens, t, true)) total += 10;
    else if (has(doc.nameTokens, t, false)) total += 6;
    else if (has(doc.keywordTokens, t, true)) total += 4;
    else if (has(doc.keywordTokens, t, false)) total += 3;
    else total += 1; // matched in the description only
  }
  if (terms.every((t) => has(doc.nameTokens, t, false))) total += 5; // whole query in the name
  return total;
}

async function facetsFor(query, terms) {
  const count = (omit, group) =>
    SearchDocument.aggregate([
      { $match: buildFilter(query, terms, omit, asCode(query.q ?? '')) },
      ...group,
    ]);
  const [brands, categories, price] = await Promise.all([
    count('brand', [
      { $match: { brandId: { $ne: null } } },
      { $group: { _id: '$brandId', count: { $sum: 1 } } },
    ]),
    count('category', [
      { $unwind: '$categoryPath' },
      { $group: { _id: '$categoryPath', count: { $sum: 1 } } },
    ]),
    count('price', [
      { $group: { _id: null, min: { $min: '$priceMin' }, max: { $max: '$priceMax' } } },
    ]),
  ]);
  const list = (rows) =>
    rows.map((r) => ({ id: r._id, count: r.count })).sort((a, b) => b.count - a.count);
  return {
    brands: list(brands),
    categories: list(categories),
    price: price[0] ? { min: price[0].min, max: price[0].max } : null,
  };
}

export function createMongoSearch() {
  return {
    name: 'mongo',

    async upsert(docs) {
      if (!docs.length) return;
      await SearchDocument.bulkWrite(
        docs.map((d) => {
          const stored = toStored(d);
          return { replaceOne: { filter: { _id: stored._id }, replacement: stored, upsert: true } };
        }),
        { ordered: false },
      );
    },

    remove: (ids) => (ids.length ? SearchDocument.deleteMany({ _id: { $in: ids } }) : null),
    clear: () => SearchDocument.deleteMany({}),
    /** Deletes every document whose id is not in `ids` (end of a full rebuild). */
    retainOnly: (ids) => SearchDocument.deleteMany({ _id: { $nin: ids } }),
    count: () => SearchDocument.countDocuments(),

    async search(query) {
      const {
        q = '',
        sort = q ? 'relevance' : 'newest',
        page = 1,
        limit = 24,
        withFacets = true,
      } = query;
      const terms = queryTerms(q);
      // Typed something with no letters/digits (e.g. "--") → nothing matches; not "show all".
      if (q.trim() && !terms.length) return { ids: [], total: 0, facets: null };
      const filter = buildFilter(query, terms, undefined, asCode(q));
      const facets = withFacets ? facetsFor(query, terms) : null;

      if (terms.length && sort === 'relevance') {
        const candidates = await SearchDocument.find(filter, {
          nameTokens: 1,
          keywordTokens: 1,
          codes: 1,
          popularity: 1,
          createdAt: 1,
        })
          .sort(SORTS.relevance)
          .limit(MAX_CANDIDATES)
          .lean();
        const ranked = candidates
          .map((d) => ({
            id: d._id,
            s: score(d, terms, asCode(q)),
            p: d.popularity,
            c: d.createdAt,
          }))
          .sort((a, b) => b.s - a.s || b.p - a.p || b.c - a.c);
        const total =
          candidates.length < MAX_CANDIDATES
            ? candidates.length
            : await SearchDocument.countDocuments(filter);
        return {
          ids: ranked.slice((page - 1) * limit, page * limit).map((r) => r.id),
          total,
          facets: await facets,
        };
      }

      const [rows, total] = await Promise.all([
        SearchDocument.find(filter, { _id: 1 })
          .sort(SORTS[sort] ?? SORTS.newest)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        SearchDocument.countDocuments(filter),
      ]);
      return { ids: rows.map((r) => r._id), total, facets: await facets };
    },

    /** Typeahead: names whose tokens start with every typed term, best first. */
    async suggest({ q, lang, limit = 8 }) {
      const terms = queryTerms(q);
      if (!terms.length) return [];
      const docs = await SearchDocument.find(buildFilter({}, terms, undefined, asCode(q)), {
        nameTokens: 1,
        keywordTokens: 1,
        codes: 1,
        names: 1,
        popularity: 1,
        createdAt: 1,
      })
        .sort(SORTS.relevance)
        .limit(200)
        .lean();
      return docs
        .map((d) => ({ d, s: score(d, terms, asCode(q)) }))
        .sort((a, b) => b.s - a.s || b.d.popularity - a.d.popularity)
        .slice(0, limit)
        .map(({ d }) => ({ id: d._id, text: d.names?.[lang] || d.names?.en || '' }));
    },
  };
}
