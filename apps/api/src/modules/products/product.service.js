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
import { getMediaByIds } from '../media/index.js';
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

const imageView = (m) => ({
  id: m.id,
  url: m.url,
  thumbUrl: m.variants.thumb?.url ?? m.url,
  mdUrl: m.variants.md?.url ?? m.url,
  width: m.width,
  height: m.height,
});

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
    variants: variants
      .filter((v) => v.isActive)
      .map((v) => ({
        id: String(v._id),
        sku: v.sku,
        optionValues: v.optionValues ?? {},
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        imageIds: ids(v.imageIds),
      })),
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    taxCategory: p.taxCategory,
    attributes,
    seo: { title: r.seo.title, description: r.seo.description },
  };
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
    for (const p of items) yield toProductDto(p, await repo.listVariants(p._id), actor);
    if (items.length < pageSize) return;
  }
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

// ---------------------------------------------------------------- usage counters (other modules)

export const countProductsInCategory = (categoryId, { session } = {}) =>
  repo.countActiveProducts({ categoryIds: categoryId }, session);
export const countProductsOfBrand = (brandId) => repo.countActiveProducts({ brandId });
export const countProductsOfSupplier = (supplierId) => repo.countActiveProducts({ supplierId });
