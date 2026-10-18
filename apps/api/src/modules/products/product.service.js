import {
  ERROR_CODES,
  EVENTS,
  gtinCheckDigit,
  normalizeDigits,
  PERMISSIONS as P,
  productAggregateIssues,
  SOURCE_LANGUAGE,
  variantOptionsKey,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { incrementCounter } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey, slugTakenError, uniqueSlug } from '../../core/slug.js';
import { getBrandsByIds } from '../brands/index.js';
import { getCategoriesByIds } from '../categories/index.js';
import { publicCustomValues, validateCustomValues } from '../customFields/index.js';
import { resolveDoc } from '../i18n/index.js';
import { getSetting } from '../settings/index.js';
import { getMediaByIds, publicImage } from '../media/index.js';
import { getSuppliersByIds } from '../suppliers/index.js';
import * as repo from './product.repo.js';

/**
 * Products (P1.4). A product and its variants are written together in ONE transaction; the API
 * takes the complete variant set on update (missing variants are removed). Cost prices are only
 * readable/writable with `product.viewCost`. Price/cost changes emit `product.priceChanged`.
 */

const LOCALIZED = [
  'name',
  'shortDescription',
  'description',
  'seo.title',
  'seo.description',
  'options.*.name',
  'options.*.values.*.label',
];
const en = (text) => ({ [SOURCE_LANGUAGE]: text ?? '' });
const ids = (list) => (list ?? []).map(String);
const notFound = () => new NotFoundError('Product not found');
const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });

// ---------------------------------------------------------------- DTOs

const imageView = (m) => ({ ...publicImage(m), mdUrl: m.variants.md?.url ?? m.url });

/** Gallery in stored order (deleted media silently dropped). */
async function galleryOf(imageIds) {
  const media = imageIds.length ? await getMediaByIds(ids(imageIds)) : [];
  const byId = new Map(media.map((m) => [m.id, m]));
  return ids(imageIds)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(imageView);
}

const variantDto = (v, canViewCost) => ({
  id: String(v._id),
  sku: v.sku,
  barcode: v.barcode ?? null,
  optionValues: v.optionValues ?? {},
  price: v.price,
  compareAtPrice: v.compareAtPrice ?? null,
  ...(canViewCost && { cost: v.cost ?? null }),
  imageIds: ids(v.imageIds),
  weightGrams: v.weightGrams ?? null,
  isActive: v.isActive,
  position: v.position,
});

/** Admin DTO: full LocalizedStrings, variants, cost only with product.viewCost. */
async function toProductDto(p, variants, actor) {
  const canViewCost = actor.can(P.PRODUCT_VIEW_COST);
  return {
    id: String(p._id),
    name: p.name ?? en(''),
    slug: p.slug,
    shortDescription: p.shortDescription ?? en(''),
    description: p.description ?? en(''),
    status: p.status,
    categoryIds: ids(p.categoryIds),
    brandId: p.brandId ? String(p.brandId) : null,
    supplierId: p.supplierId ? String(p.supplierId) : null,
    images: await galleryOf(p.imageIds ?? []),
    options: (p.options ?? []).map((o) => ({
      key: o.key,
      name: o.name ?? en(''),
      values: (o.values ?? []).map((v) => ({
        key: v.key,
        label: v.label ?? en(''),
        swatch: v.swatch ?? null,
      })),
    })),
    tags: p.tags ?? [],
    taxCategory: p.taxCategory,
    customFields: p.customFields ?? {},
    seo: { title: p.seo?.title ?? en(''), description: p.seo?.description ?? en('') },
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    variantCount: p.variantCount,
    variants: variants.map((v) => variantDto(v, canViewCost)),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------- validation helpers

function assertCostAccess(actor, variants) {
  if (!variants || actor.can(P.PRODUCT_VIEW_COST)) return;
  if (variants.some((v) => v.cost !== undefined)) {
    throw new ForbiddenError('Setting cost prices requires product.viewCost');
  }
}

/** Referenced categories/brand/supplier/media must exist (and not be deleted). */
async function assertReferences({ categoryIds, brandId, supplierId, imageIds }) {
  const details = [];
  if (categoryIds?.length) {
    const found = new Set((await getCategoriesByIds(categoryIds)).map((c) => c.id));
    categoryIds.forEach((id, i) => {
      if (!found.has(id)) details.push({ path: `categoryIds.${i}`, message: V.ID_INVALID });
    });
  }
  if (brandId && !(await getBrandsByIds([brandId])).length) {
    details.push({ path: 'brandId', message: V.ID_INVALID });
  }
  if (supplierId && !(await getSuppliersByIds([supplierId])).length) {
    details.push({ path: 'supplierId', message: V.ID_INVALID });
  }
  if (imageIds?.length) {
    const found = new Set((await getMediaByIds(imageIds)).map((m) => m.id));
    imageIds.forEach((id, i) => {
      if (!found.has(id)) details.push({ path: `imageIds.${i}`, message: V.ID_INVALID });
    });
  }
  if (details.length) throw new ValidationError(details);
}

function assertAggregate(state) {
  const issues = productAggregateIssues(state);
  if (issues.length) {
    throw new ValidationError(issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
}

const codeTaken = (code, path) =>
  new AppError(
    code,
    code === ERROR_CODES.SKU_TAKEN ? 'SKU already in use' : 'Barcode already in use',
    {
      status: 409,
      details: [{ path, message: V.DUPLICATE }],
    },
  );

/** SKUs/barcodes must be unique across ALL products (DB unique indexes back this up). */
async function assertCodesFree(productId, variants) {
  const conflicts = await repo.findCodeConflicts({
    productId,
    skus: variants.map((v) => v.sku),
    barcodes: variants.map((v) => v.barcode).filter(Boolean),
  });
  for (const c of conflicts) {
    const skuIdx = variants.findIndex((v) => v.sku === c.sku);
    if (skuIdx >= 0) throw codeTaken(ERROR_CODES.SKU_TAKEN, `variants.${skuIdx}.sku`);
    const bcIdx = variants.findIndex((v) => v.barcode && v.barcode === c.barcode);
    if (bcIdx >= 0) throw codeTaken(ERROR_CODES.BARCODE_TAKEN, `variants.${bcIdx}.barcode`);
  }
}

function mapWriteError(err) {
  if (isDuplicateKey(err, 'slug')) return slugTakenError();
  if (isDuplicateKey(err, 'sku')) return codeTaken(ERROR_CODES.SKU_TAKEN, 'variants');
  if (isDuplicateKey(err, 'barcode')) return codeTaken(ERROR_CODES.BARCODE_TAKEN, 'variants');
  return err;
}

/**
 * Option documents from input, keeping existing translations (matched by key) so unchanged
 * English isn't re-translated and Arabic isn't lost.
 */
function optionDocs(input, existing = []) {
  const prev = new Map(existing.map((o) => [o.key, o]));
  return input.map((o) => {
    const old = prev.get(o.key);
    const oldValues = new Map((old?.values ?? []).map((v) => [v.key, v]));
    return {
      key: o.key,
      name: { ...(old?.name ?? {}), [SOURCE_LANGUAGE]: o.name },
      values: o.values.map((v) => {
        const ov = oldValues.get(v.key);
        return {
          key: v.key,
          label: { ...(ov?.label ?? {}), [SOURCE_LANGUAGE]: v.label },
          swatch: v.swatch ?? null,
        };
      }),
    };
  });
}

const priceRange = (variants) => {
  const prices = variants.filter((v) => v.isActive !== false).map((v) => v.price);
  return {
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    variantCount: variants.length,
  };
};

const variantFields = (v, position) => ({
  sku: v.sku,
  barcode: v.barcode ?? null,
  optionValues: v.optionValues ?? {},
  optionsKey: variantOptionsKey(v.optionValues),
  price: v.price,
  compareAtPrice: v.compareAtPrice ?? null,
  imageIds: v.imageIds ?? [],
  weightGrams: v.weightGrams ?? null,
  isActive: v.isActive ?? true,
  position,
});

const auditView = (p) => ({
  name: p.name?.en ?? '',
  slug: p.slug,
  status: p.status,
  brandId: p.brandId ? String(p.brandId) : null,
  categoryIds: ids(p.categoryIds),
  variantCount: p.variantCount,
});

// ---------------------------------------------------------------- queries

export async function listProducts(query) {
  const { items, total } = await repo.listProducts(query);
  const firstImages = items.map((p) => p.imageIds?.[0]).filter(Boolean);
  const media = firstImages.length ? await getMediaByIds(ids(firstImages)) : [];
  const byId = new Map(media.map((m) => [m.id, m]));
  return {
    items: items.map((p) => {
      const img = p.imageIds?.[0] && byId.get(String(p.imageIds[0]));
      return {
        id: String(p._id),
        name: p.name ?? en(''),
        slug: p.slug,
        status: p.status,
        image: img ? imageView(img) : null,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        variantCount: p.variantCount,
        categoryIds: ids(p.categoryIds),
        brandId: p.brandId ? String(p.brandId) : null,
        updatedAt: p.updatedAt,
      };
    }),
    meta: { page: query.page, limit: query.limit, total },
  };
}

export async function getProduct(actor, id) {
  const p = await repo.findActiveProduct(id);
  if (!p) throw notFound();
  return toProductDto(p, await repo.listVariants(id), actor);
}

// ---------------------------------------------------------------- commands

/**
 * @param {{ dryRun?: boolean }} [opts] dryRun: run every check (references, custom fields, codes,
 *   slug) and stop before writing — used by import validation. Returns null then.
 */
export async function createProduct(actor, input, { dryRun = false } = {}) {
  assertCostAccess(actor, input.variants);
  await assertReferences(input);
  const customFields = await validateCustomValues('product', input.customFields);
  if (input.slug && (await repo.slugExists(input.slug))) throw slugTakenError();
  await assertCodesFree(null, input.variants);
  const slug =
    input.slug ??
    (await uniqueSlug(input.name, { exists: (v) => repo.slugExists(v), fallback: 'product' }));

  if (dryRun) return null;
  const variants = input.variants.map((v, i) => ({ ...variantFields(v, i), cost: v.cost ?? null }));
  let created;
  try {
    created = await withTransaction(async (session) => {
      const doc = repo.newProduct({
        name: en(input.name),
        slug,
        shortDescription: en(input.shortDescription),
        description: en(input.description),
        status: input.status ?? 'draft',
        categoryIds: input.categoryIds ?? [],
        brandId: input.brandId ?? null,
        supplierId: input.supplierId ?? null,
        imageIds: input.imageIds ?? [],
        options: optionDocs(input.options ?? []),
        tags: input.tags ?? [],
        taxCategory: input.taxCategory ?? 'standard',
        customFields,
        seo: { title: en(input.seo?.title), description: en(input.seo?.description) },
        ...priceRange(variants),
        createdBy: actor.staffId,
      });
      const product = await repo.saveProduct(doc, session);
      await repo.insertVariants(
        variants.map((v) => ({ ...v, productId: product._id })),
        session,
      );
      return product;
    });
  } catch (err) {
    throw mapWriteError(err);
  }
  emit(actor, EVENTS.PRODUCT_CREATED, {
    productId: String(created._id),
    after: auditView(created),
  });
  return getProduct(actor, String(created._id));
}

/**
 * Partial update of product fields; `variants` (when present) is the complete set: entries with
 * `id` update that variant, entries without create one, existing variants not listed are removed.
 */
/** @param {{ dryRun?: boolean }} [opts] see createProduct */
export async function updateProduct(actor, id, input, { dryRun = false } = {}) {
  assertCostAccess(actor, input.variants);
  const current = await repo.findActiveProduct(id);
  if (!current) throw notFound();
  const existingVariants = await repo.listVariants(id);
  await assertReferences(input);
  const customFields =
    input.customFields !== undefined
      ? await validateCustomValues('product', input.customFields, current.customFields)
      : undefined;
  if (
    input.slug !== undefined &&
    input.slug !== current.slug &&
    (await repo.slugExists(input.slug, id))
  ) {
    throw slugTakenError();
  }

  // Validate the MERGED aggregate (options/images/variants may come from storage).
  const options = input.options ?? current.options.map((o) => ({ key: o.key, values: o.values }));
  const imageIds = input.imageIds ?? ids(current.imageIds);
  const byId = new Map(existingVariants.map((v) => [String(v._id), v]));
  const nextVariants =
    input.variants ??
    existingVariants.map((v) => ({ ...v, id: String(v._id), imageIds: ids(v.imageIds) }));
  nextVariants.forEach((v, i) => {
    if (v.id && !byId.has(v.id)) {
      throw new ValidationError([{ path: `variants.${i}.id`, message: V.ID_INVALID }]);
    }
  });
  assertAggregate({ options, imageIds, variants: nextVariants });
  if (input.variants) await assertCodesFree(id, input.variants);
  if (dryRun) return null;

  const priceChanges = [];
  let saved;
  try {
    saved = await withTransaction(async (session) => {
      const doc = await repo.loadProductForUpdate(id, session);
      if (!doc) throw notFound();
      const set = (path, value) => value !== undefined && doc.set(path, value);
      set(`name.${SOURCE_LANGUAGE}`, input.name);
      set(`shortDescription.${SOURCE_LANGUAGE}`, input.shortDescription);
      set(`description.${SOURCE_LANGUAGE}`, input.description);
      set(`seo.title.${SOURCE_LANGUAGE}`, input.seo?.title);
      set(`seo.description.${SOURCE_LANGUAGE}`, input.seo?.description);
      for (const k of [
        'slug',
        'status',
        'categoryIds',
        'brandId',
        'supplierId',
        'imageIds',
        'tags',
        'taxCategory',
      ]) {
        set(k, input[k]);
      }
      if (customFields !== undefined) doc.set('customFields', customFields);
      if (input.options) doc.set('options', optionDocs(input.options, doc.toObject().options));

      if (input.variants) {
        priceChanges.length = 0; // the callback may re-run when the transaction retries
        // Re-read inside the transaction: never act on a stale snapshot of the variants.
        const live = await repo.listVariants(id, session);
        const liveById = new Map(live.map((v) => [String(v._id), v]));
        input.variants.forEach((v, i) => {
          if (v.id && !liveById.has(v.id)) {
            throw new ValidationError([{ path: `variants.${i}.id`, message: V.ID_INVALID }]);
          }
        });
        const keep = new Set(input.variants.filter((v) => v.id).map((v) => v.id));
        await repo.softDeleteVariants(
          live.filter((v) => !keep.has(String(v._id))).map((v) => v._id),
          session,
        );
        // Codes that change go through a temporary value first, so swapping SKUs/barcodes
        // between two variants never collides with the unique indexes mid-way.
        const changing = input.variants.filter((v) => {
          const old = v.id && liveById.get(v.id);
          return old && (old.sku !== v.sku || (old.barcode ?? null) !== (v.barcode ?? null));
        });
        for (const v of changing) {
          await repo.updateVariant(v.id, { sku: `~${v.id}`, barcode: null }, session);
        }
        const inserts = [];
        for (const [i, v] of input.variants.entries()) {
          const fields = variantFields(v, i);
          if (!v.id) {
            inserts.push({ ...fields, cost: v.cost ?? null, productId: doc._id });
            continue;
          }
          const old = liveById.get(v.id);
          const cost = v.cost === undefined ? (old.cost ?? null) : v.cost;
          await repo.updateVariant(v.id, { ...fields, cost }, session);
          if (
            old.price !== fields.price ||
            (old.compareAtPrice ?? null) !== fields.compareAtPrice ||
            (old.cost ?? null) !== cost
          ) {
            priceChanges.push({
              variantId: v.id,
              sku: fields.sku,
              before: {
                price: old.price,
                compareAtPrice: old.compareAtPrice ?? null,
                cost: old.cost ?? null,
              },
              after: { price: fields.price, compareAtPrice: fields.compareAtPrice, cost },
            });
          }
        }
        await repo.insertVariants(inserts, session);
        const all = await repo.listVariants(id, session);
        const range = priceRange(all);
        for (const [k, v] of Object.entries(range)) doc.set(k, v);
      }
      return repo.saveProduct(doc, session);
    });
  } catch (err) {
    throw mapWriteError(err);
  }
  emit(actor, EVENTS.PRODUCT_UPDATED, {
    productId: id,
    before: auditView(current),
    after: auditView(saved),
  });
  if (priceChanges.length)
    emit(actor, EVENTS.PRODUCT_PRICE_CHANGED, { productId: id, changes: priceChanges });
  return getProduct(actor, id);
}

/** Soft delete (product + variants). Order history keeps its own snapshots. */
export async function deleteProduct(actor, id) {
  const deleted = await withTransaction((session) => repo.softDeleteProduct(id, session));
  if (!deleted) throw notFound();
  emit(actor, EVENTS.PRODUCT_DELETED, { productId: id });
}

// ---------------------------------------------------------------- storefront

/** Active product by slug in one language: no cost, no supplier, only active variants. */
/**
 * Online availability, provided by the inventory module at the composition root (avoids an import
 * cycle): variant ids → Set of those in stock. Unset → availability unknown (`inStock: null`).
 * @type {(variantIds: string[]) => Promise<Set<string>> | null}
 */
let onlineInStock = async () => null;
export function setAvailabilityProvider(fn) {
  onlineInStock = fn;
}

export async function getPublicProduct(slug, lang) {
  const p = await repo.findPublicBySlug(slug);
  if (!p) throw notFound();
  const [variants, images, brands, attributes] = await Promise.all([
    repo.listVariants(p._id),
    galleryOf(p.imageIds ?? []),
    p.brandId ? getBrandsByIds([String(p.brandId)]) : [],
    publicCustomValues('product', p.customFields, lang),
  ]);
  const r = resolveDoc(p, LOCALIZED, lang);
  const brand = brands[0]?.isActive ? brands[0] : null;
  const active = variants.filter((v) => v.isActive);
  const stock = await onlineInStock(active.map((v) => String(v._id)));
  return {
    id: String(p._id),
    name: r.name,
    slug: p.slug,
    shortDescription: r.shortDescription,
    description: r.description,
    brand: brand && { id: brand.id, name: brand.name, slug: brand.slug },
    categoryIds: ids(p.categoryIds),
    images: images.map((img) => ({ ...img, alt: r.name })),
    options: r.options.map((o) => ({
      key: o.key,
      name: o.name,
      values: o.values.map((v) => ({ key: v.key, label: v.label, swatch: v.swatch ?? null })),
    })),
    variants: active.map((v) => ({
      id: String(v._id),
      sku: v.sku,
      optionValues: v.optionValues ?? {},
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      imageIds: ids(v.imageIds),
      inStock: stock ? stock.has(String(v._id)) : null,
    })),
    inStock: stock ? active.some((v) => stock.has(String(v._id))) : null,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    taxCategory: p.taxCategory,
    attributes,
    seo: { title: r.seo.title, description: r.seo.description },
  };
}

/** Sitemap page: `{ slug, updatedAt }` of active products (5000 per page). */
export const SITEMAP_PAGE_SIZE = 5000;
export async function listPublicSlugs(page) {
  const rows = await repo.listPublicSlugs((page - 1) * SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE);
  return rows.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt }));
}

// ---------------------------------------------------------------- bulk import/export (P1.7)

/** Admin DTO of an active product by slug, or null. */
export async function findProductBySlug(actor, slug) {
  const p = await repo.findActiveBySlug(slug);
  return p ? toProductDto(p, await repo.listVariants(p._id), actor) : null;
}

/**
 * Async iterator over admin DTOs (with variants) matching list filters, in pages — for exports.
 * @param {object} actor
 * @param {{ status?: string, categoryId?: string, brandId?: string, supplierId?: string, q?: string }} filters
 */
export async function* iterateProducts(actor, filters = {}, pageSize = 200) {
  for (let page = 1; ; page += 1) {
    const { items } = await repo.listProducts({
      ...filters,
      page,
      limit: pageSize,
      sort: { field: 'createdAt', direction: 1 },
    });
    if (!items.length) return;
    const variants = await repo.listVariantsByProductIds(items.map((p) => p._id));
    const byProduct = new Map();
    for (const v of variants) {
      const pid = String(v.productId);
      let list = byProduct.get(pid);
      if (!list) {
        list = [];
        byProduct.set(pid, list);
      }
      list.push(v);
    }
    for (const p of items) {
      yield toProductDto(p, byProduct.get(String(p._id)) ?? [], actor);
    }
    if (items.length < pageSize) return;
  }
}

// ---------------------------------------------------------------- search (P1.8)

/**
 * Raw material for search documents. Deleted products come back with `deleted: true` so the
 * index can drop them; missing ids are simply absent.
 */
export async function getIndexSources(productIds) {
  const products = await repo.findForIndex(productIds);
  const variants = await repo.activeVariantsOf(products.map((p) => p._id));
  const byProduct = Map.groupBy(variants, (v) => String(v.productId));
  return products.map((p) => ({
    id: String(p._id),
    deleted: Boolean(p.deletedAt),
    status: p.status,
    name: p.name ?? en(''),
    shortDescription: p.shortDescription ?? en(''),
    description: p.description ?? en(''),
    tags: p.tags ?? [],
    categoryIds: ids(p.categoryIds),
    brandId: p.brandId ? String(p.brandId) : null,
    options: p.options ?? [],
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    createdAt: p.createdAt,
    codes: (byProduct.get(String(p._id)) ?? []).flatMap((v) => [v.sku, v.barcode].filter(Boolean)),
  }));
}

/** Active product ids in batches (optionally by category/brand) — for re-indexing. */
export const productIdBatches = (filter) => repo.activeProductIds(filter);

/**
 * Storefront product cards in `lang`, in the order of `ids` (unknown/inactive ids skipped):
 * name, slug, main image, price range and the compare-at price of the cheapest variant.
 */
/** Max swatch dots per card. */
const CARD_SWATCHES = 8;

/**
 * First option whose values have swatch colours, with each value's variants and the first
 * variant image showing it (card image swap). Null when the product has no swatch option.
 */
function swatchOption(p, variants) {
  const o = (p.options ?? []).find((opt) => opt.values?.some((v) => v.swatch));
  if (!o) return null;
  const values = o.values
    .map((v) => {
      const matching = variants
        .filter((x) => x.optionValues?.[o.key] === v.key)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return {
        key: v.key,
        swatch: v.swatch ?? null,
        variantIds: matching.map((x) => String(x._id)),
        imageId: matching.find((x) => x.imageIds?.length)?.imageIds[0] ?? null,
      };
    })
    .filter((v) => v.variantIds.length)
    .slice(0, CARD_SWATCHES);
  return values.length ? { key: o.key, values } : null;
}

export async function getPublicCards(ids, lang) {
  if (!ids.length) return [];
  const products = (await repo.findForIndex(ids)).filter(
    (p) => !p.deletedAt && p.status === 'active',
  );
  const variants = await repo.activeVariantsOf(products.map((p) => p._id));
  const byProduct = Map.groupBy(
    variants.filter((v) => v.isActive),
    (v) => String(v.productId),
  );
  const swatchesOf = new Map(
    products.map((p) => [String(p._id), swatchOption(p, byProduct.get(String(p._id)) ?? [])]),
  );
  const media = await getMediaByIds([
    ...new Set(
      [
        ...products.map((p) => p.imageIds?.[0]),
        ...[...swatchesOf.values()].flatMap((s) => s?.values.map((v) => v.imageId) ?? []),
      ]
        .filter(Boolean)
        .map(String),
    ),
  ]);
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const stock = await onlineInStock(variants.filter((v) => v.isActive).map((v) => String(v._id)));
  const brandIds = [
    ...new Set(
      products
        .map((p) => p.brandId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const brands = new Map(
    (brandIds.length ? await getBrandsByIds(brandIds) : [])
      .filter((b) => b.isActive)
      .map((b) => [b.id, b]),
  );
  const cards = new Map(
    products.map((p) => {
      const r = resolveDoc(p, ['name', 'options.*.name', 'options.*.values.*.label'], lang);
      const own = byProduct.get(String(p._id)) ?? [];
      const sw = swatchesOf.get(String(p._id));
      const swatchName = sw && r.options.find((o) => o.key === sw.key);
      const cheapest = (byProduct.get(String(p._id)) ?? []).sort((a, b) => a.price - b.price)[0];
      const img = p.imageIds?.[0] && mediaById.get(String(p.imageIds[0]));
      const brand = p.brandId && brands.get(String(p.brandId));
      return [
        String(p._id),
        {
          id: String(p._id),
          slug: p.slug,
          name: r.name,
          image: img ? { ...imageView(img), alt: r.name } : null,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          compareAtPrice: cheapest?.compareAtPrice ?? null,
          brand: brand ? { name: brand.name, slug: brand.slug } : null,
          variantCount: p.variantCount,
          inStock: stock ? own.some((v) => stock.has(String(v._id))) : null,
          /** One-click add: the only variant of a product without choices. */
          defaultVariantId: own.length === 1 ? String(own[0]._id) : null,
          /** Colour-style option shown as dots on the card; each value swaps the card image. */
          swatches: sw
            ? {
                key: sw.key,
                name: swatchName?.name ?? '',
                values: sw.values.map((v) => {
                  const m = v.imageId && mediaById.get(String(v.imageId));
                  return {
                    key: v.key,
                    label: swatchName?.values.find((x) => x.key === v.key)?.label ?? v.key,
                    swatch: v.swatch,
                    image: m ? { ...imageView(m), alt: r.name } : null,
                    inStock: stock ? v.variantIds.some((id) => stock.has(id)) : null,
                  };
                }),
              }
            : null,
        },
      ];
    }),
  );
  return ids.map((id) => cards.get(id)).filter(Boolean);
}

// ---------------------------------------------------------------- barcodes (P1.6)

const BARCODE_COUNTER = 'barcode:internal';
const INTERNAL_MAX = 9_999_999_999; // 10 digits after the 2-digit prefix

/**
 * New in-store EAN-13 codes: `<prefix 20–29><10-digit sequence><check digit>`. The sequence never
 * repeats, and codes already used (e.g. imported) are skipped. Uniqueness is still enforced when a
 * product is saved; unused generated codes are simply never issued again.
 * @param {number} count
 * @returns {Promise<string[]>}
 */
export async function generateBarcodes(count) {
  const prefix = getSetting('barcode.internalPrefix');
  const codes = [];
  for (let attempt = 0; codes.length < count && attempt < 5; attempt += 1) {
    const need = count - codes.length;
    const last = await incrementCounter(BARCODE_COUNTER, need);
    if (last > INTERNAL_MAX)
      throw new AppError(ERROR_CODES.CONFLICT, 'Internal barcode range exhausted', { status: 409 });
    const batch = Array.from({ length: need }, (_, i) => {
      const body = `${prefix}${String(last - need + 1 + i).padStart(10, '0')}`;
      return body + gtinCheckDigit(body);
    });
    const taken = await repo.existingBarcodes(batch);
    codes.push(...batch.filter((c) => !taken.has(c)));
  }
  return codes;
}

/**
 * Scan / type-ahead lookup: active variant by barcode (then SKU) with its product summary.
 * Input is normalized like stored codes (trim, Arabic digits → ASCII, upper-case).
 */
export async function lookupByCode(actor, raw) {
  const code = normalizeDigits(raw).trim().toUpperCase();
  const variant = await repo.findVariantByCode(code);
  const product = variant && (await repo.findActiveProduct(variant.productId));
  if (!product) throw new NotFoundError('No product with this barcode or SKU');
  const [image] = await galleryOf(
    (variant.imageIds?.length ? variant.imageIds : (product.imageIds ?? [])).slice(0, 1),
  );
  return {
    matchedBy: variant.barcode === code ? 'barcode' : 'sku',
    product: {
      id: String(product._id),
      name: product.name ?? en(''),
      slug: product.slug,
      status: product.status,
      image: image ?? null,
      options: (product.options ?? []).map((o) => ({
        key: o.key,
        name: o.name ?? en(''),
        values: (o.values ?? []).map((v) => ({ key: v.key, label: v.label ?? en('') })),
      })),
    },
    variant: variantDto(variant, actor.can(P.PRODUCT_VIEW_COST)),
  };
}

// ---------------------------------------------------------------- inventory (other modules)

/**
 * Variants that can hold stock: not deleted, of a product that is not deleted (drafts included —
 * stock is often received before a product is published). @returns {Promise<Map<string, { productId: string }>>}
 */
export async function findStockableVariants(ids) {
  const variants = (await repo.findVariantsByIds(ids)).filter((v) => !v.deletedAt);
  const products = await repo.findProductsByIds([
    ...new Set(variants.map((v) => String(v.productId))),
  ]);
  const live = new Set(products.filter((p) => !p.deletedAt).map((p) => String(p._id)));
  return new Map(
    variants
      .filter((v) => live.has(String(v.productId)))
      .map((v) => [String(v._id), { productId: String(v.productId) }]),
  );
}

/**
 * Display data for stock screens, deleted variants included (history).
 * `options` = the variant's option values as `{ name, value }` LocalizedStrings (e.g. Color: Red).
 * @returns {Promise<Map<string, object>>}
 */
export async function getVariantSummaries(ids, { withCost = false } = {}) {
  if (!ids.length) return new Map();
  const variants = await repo.findVariantsByIds([...new Set(ids.map(String))]);
  const products = new Map(
    (await repo.findProductsByIds([...new Set(variants.map((v) => String(v.productId)))])).map(
      (p) => [String(p._id), p],
    ),
  );
  return new Map(
    variants.map((v) => {
      const p = products.get(String(v.productId));
      const options = (p?.options ?? []).flatMap((o) => {
        const value = (o.values ?? []).find((x) => x.key === v.optionValues?.[o.key]);
        return value ? [{ name: o.name ?? en(''), value: value.label ?? en('') }] : [];
      });
      return [
        String(v._id),
        {
          id: String(v._id),
          productId: String(v.productId),
          productName: p?.name ?? en(''),
          sku: v.sku,
          barcode: v.barcode ?? null,
          options,
          ...(withCost && { cost: v.cost ?? null }),
          deleted: Boolean(v.deletedAt || !p || p.deletedAt),
        },
      ];
    }),
  );
}

/**
 * Cart/checkout view of variants in one language. `sellable` = active product, not deleted, and
 * an active variant — anything else stays in the cart as "unavailable".
 * @returns {Promise<Map<string, object>>}
 */
export async function getCartVariants(variantIds, lang) {
  if (!variantIds.length) return new Map();
  const variants = await repo.findVariantsByIds([...new Set(variantIds.map(String))]);
  const products = new Map(
    (await repo.findForIndex([...new Set(variants.map((v) => String(v.productId)))])).map((p) => [
      String(p._id),
      p,
    ]),
  );
  const media = await getMediaByIds([
    ...new Set(
      variants.flatMap((v) => {
        const p = products.get(String(v.productId));
        const first = v.imageIds?.[0] ?? p?.imageIds?.[0];
        return first ? [String(first)] : [];
      }),
    ),
  ]);
  const mediaById = new Map(media.map((m) => [m.id, m]));
  return new Map(
    variants.map((v) => {
      const p = products.get(String(v.productId));
      const r = p ? resolveDoc(p, LOCALIZED, lang) : null;
      const img = mediaById.get(String(v.imageIds?.[0] ?? p?.imageIds?.[0] ?? ''));
      const options = (r?.options ?? []).flatMap((o) => {
        const value = o.values.find((x) => x.key === v.optionValues?.[o.key]);
        return value ? [{ name: o.name, value: value.label }] : [];
      });
      return [
        String(v._id),
        {
          variantId: String(v._id),
          productId: String(v.productId),
          slug: p?.slug ?? null,
          name: r?.name ?? '',
          options,
          sku: v.sku,
          image: img ? { ...imageView(img), alt: r?.name ?? '' } : null,
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? null,
          taxCategory: p?.taxCategory ?? 'standard',
          sellable: Boolean(
            p && !p.deletedAt && p.status === 'active' && !v.deletedAt && v.isActive,
          ),
        },
      ];
    }),
  );
}

/** Staff search (SKU prefix / barcode / product name) → active variant ids. */
export const matchVariantIds = (q, limit) => repo.matchVariantIds(q, limit);

/** Variant picker for purchase orders and stock screens (cost only with product.viewCost). */
export async function searchVariants(actor, { q, limit }) {
  const ids = await repo.matchVariantIds(q, limit);
  const summaries = await getVariantSummaries(ids.map(String), {
    withCost: actor.can(P.PRODUCT_VIEW_COST),
  });
  return [...summaries.values()]
    .filter((v) => !v.deleted)
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

/** `Map<variantId, { productId, cost }>` — read inside the caller's transaction. */
export async function getVariantCosts(ids, { session } = {}) {
  const rows = await repo.findVariantCosts(ids, session);
  return new Map(
    rows.map((v) => [String(v._id), { productId: String(v.productId), cost: v.cost ?? null }]),
  );
}

/**
 * Sets unit costs inside the caller's transaction (goods receipts). Only real changes are written.
 * Publish the returned changes with `publishCostChanges` after commit.
 * @param {{ variantId: string, cost: number | null }[]} updates
 */
export async function setVariantCosts(updates, { session } = {}) {
  const current = await getVariantCosts(
    updates.map((u) => u.variantId),
    { session },
  );
  const changes = [];
  for (const u of updates) {
    const before = current.get(String(u.variantId));
    if (!before || before.cost === u.cost) continue;
    await repo.setVariantCost(u.variantId, u.cost, session);
    changes.push({
      variantId: String(u.variantId),
      productId: before.productId,
      before: before.cost,
      after: u.cost,
    });
  }
  return changes;
}

export function publishCostChanges(changes, { actorId = null, source }) {
  for (const c of changes)
    void eventBus.emit(EVENTS.PRODUCT_COST_CHANGED, { ...c, source, actorId });
}

// ---------------------------------------------------------------- usage counters (other modules)

export const countProductsInCategory = (categoryId, { session } = {}) =>
  repo.countActiveProducts({ categoryIds: categoryId }, session);
export const countProductsOfBrand = (brandId) => repo.countActiveProducts({ brandId });
export const countProductsOfSupplier = (supplierId) => repo.countActiveProducts({ supplierId });

/** Ids of active products with this tag, newest first (product rails, P5.3). */
export async function getProductIdsByTag(tag, limit = 8) {
  const rows = await repo.findIdsByTag(tag, limit);
  return rows.map((r) => String(r._id));
}
