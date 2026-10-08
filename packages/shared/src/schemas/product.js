import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import {
  barcode,
  moneyMinor,
  objectId,
  paginationQuery,
  plainText,
  sku,
  slug,
  toSlug,
} from '../validators/fields.js';

/**
 * Product + variant contracts (P1.4). A product is the aggregate root: it owns its options
 * (e.g. Color × Size) and the variants that combine them. Every product has ≥ 1 variant; a product
 * without options has exactly one "default" variant. Money is integer halalas.
 */
export const PRODUCT = Object.freeze({
  STATUSES: Object.freeze(['draft', 'active', 'archived']),
  /** ZATCA VAT categories: standard rate, zero-rated, exempt. */
  TAX_CATEGORIES: Object.freeze(['standard', 'zero', 'exempt']),
  NAME_MAX: 150,
  SHORT_DESCRIPTION_MAX: 300,
  DESCRIPTION_MAX: 10_000,
  SEO_TITLE_MAX: 70,
  SEO_DESCRIPTION_MAX: 160,
  MAX_OPTIONS: 3,
  MAX_OPTION_VALUES: 50,
  MAX_VARIANTS: 250,
  MAX_IMAGES: 30,
  MAX_VARIANT_IMAGES: 10,
  MAX_CATEGORIES: 10,
  MAX_TAGS: 30,
  MAX_WEIGHT_GRAMS: 1_000_000,
});

const OPTION_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionKey = z
  .string({ error: V.INVALID_TYPE })
  .trim()
  .max(40, { error: V.TOO_LONG })
  .regex(OPTION_KEY_RE, { error: V.SLUG_INVALID });
const uniqueList = (item, max) =>
  z
    .array(item)
    .max(max, { error: V.TOO_LONG })
    .refine((a) => new Set(a).size === a.length, { error: V.DUPLICATE });
/** `''` clears an optional field (stored as null). */
const clearable = (schema) =>
  z.union([z.literal('').transform(() => null), z.null(), schema]).optional();

/** Canonical combination id of a variant: `color=red|size=m` ('' for the default variant). */
export const variantOptionsKey = (optionValues = {}) =>
  Object.keys(optionValues)
    .sort()
    .map((k) => `${k}=${optionValues[k]}`)
    .join('|');

/** Missing option/value keys are derived from the English text (stable once saved). */
const withKeys = (options) =>
  options.map((o, i) => ({
    ...o,
    key: o.key ?? (toSlug(o.name).slice(0, 40).replace(/-+$/, '') || `option-${i + 1}`),
    values: o.values.map((v, j) => ({
      ...v,
      key: v.key ?? (toSlug(v.label).slice(0, 40).replace(/-+$/, '') || `value-${j + 1}`),
    })),
  }));

/**
 * Cross-field rules of the aggregate. Pure: used by the zod schemas (forms) and by the API on the
 * MERGED state of an update (when only variants or only options are sent).
 * @param {{ options: { key: string, values: { key: string }[] }[], imageIds?: string[],
 *   variants: { sku: string, barcode?: string | null, optionValues?: Record<string, string>,
 *   price: number, compareAtPrice?: number | null, imageIds?: string[] }[] }} p
 * @returns {{ path: (string | number)[], message: string }[]}
 */
export function productAggregateIssues({ options, imageIds, variants }) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });

  const optionKeys = options.map((o) => o.key);
  optionKeys.forEach(
    (k, i) => optionKeys.indexOf(k) !== i && add(['options', i, 'key'], V.DUPLICATE),
  );
  options.forEach((o, i) => {
    const keys = o.values.map((v) => v.key);
    keys.forEach(
      (k, j) => keys.indexOf(k) !== j && add(['options', i, 'values', j, 'key'], V.DUPLICATE),
    );
  });

  if (!options.length && variants.length !== 1) add(['variants'], V.VARIANTS_SINGLE);

  const combos = new Set();
  const skus = new Map();
  const barcodes = new Map();
  const gallery = imageIds ? new Set(imageIds) : null;
  variants.forEach((v, i) => {
    const values = v.optionValues ?? {};
    const given = Object.keys(values);
    if (given.length !== options.length || options.some((o) => !(o.key in values))) {
      add(['variants', i, 'optionValues'], V.VARIANT_OPTIONS_MISMATCH);
    } else if (options.some((o) => !o.values.some((val) => val.key === values[o.key]))) {
      add(['variants', i, 'optionValues'], V.VARIANT_OPTIONS_MISMATCH);
    } else {
      const combo = variantOptionsKey(values);
      if (combos.has(combo)) add(['variants', i, 'optionValues'], V.DUPLICATE);
      combos.add(combo);
    }
    if (skus.has(v.sku)) add(['variants', i, 'sku'], V.DUPLICATE);
    skus.set(v.sku, i);
    if (v.barcode) {
      if (barcodes.has(v.barcode)) add(['variants', i, 'barcode'], V.DUPLICATE);
      barcodes.set(v.barcode, i);
    }
    if (v.compareAtPrice != null && v.compareAtPrice <= v.price) {
      add(['variants', i, 'compareAtPrice'], V.COMPARE_AT_PRICE);
    }
    if (gallery && (v.imageIds ?? []).some((id) => !gallery.has(id))) {
      add(['variants', i, 'imageIds'], V.VARIANT_IMAGE_NOT_IN_GALLERY);
    }
  });
  return issues;
}

export function createProductSchemas() {
  const optionValue = z.object({
    key: optionKey.optional(),
    label: plainText({ min: 1, max: 60 }),
    swatch: clearable(
      z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, { error: V.INVALID_TYPE })
        .transform((v) => v.toLowerCase()),
    ),
  });
  const option = z.object({
    key: optionKey.optional(),
    name: plainText({ min: 1, max: 40 }),
    values: z
      .array(optionValue)
      .min(1, { error: V.REQUIRED })
      .max(PRODUCT.MAX_OPTION_VALUES, { error: V.TOO_LONG }),
  });
  const options = z
    .array(option)
    .max(PRODUCT.MAX_OPTIONS, { error: V.TOO_LONG })
    .transform(withKeys);

  const variant = z.object({
    /** Existing variant id (update); omit for a new variant. */
    id: objectId.optional(),
    sku,
    barcode: clearable(barcode),
    optionValues: z.record(optionKey, optionKey).default({}),
    price: moneyMinor(),
    compareAtPrice: moneyMinor({ allowZero: false }).nullable().optional(),
    /** Requires product.viewCost to send; omitted on update = unchanged. */
    cost: moneyMinor().nullable().optional(),
    imageIds: uniqueList(objectId, PRODUCT.MAX_VARIANT_IMAGES).optional(),
    weightGrams: z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .min(0)
      .max(PRODUCT.MAX_WEIGHT_GRAMS, { error: V.TOO_LONG })
      .nullable()
      .optional(),
    isActive: z.boolean({ error: V.INVALID_TYPE }).optional(),
  });
  const variants = z
    .array(variant)
    .min(1, { error: V.REQUIRED })
    .max(PRODUCT.MAX_VARIANTS, { error: V.TOO_LONG });

  const fields = {
    name: plainText({ min: 1, max: PRODUCT.NAME_MAX }),
    slug: slug.optional(),
    shortDescription: plainText({ max: PRODUCT.SHORT_DESCRIPTION_MAX }).optional(),
    description: plainText({ max: PRODUCT.DESCRIPTION_MAX }).optional(),
    status: z.enum(PRODUCT.STATUSES, { error: V.INVALID_TYPE }).optional(),
    categoryIds: uniqueList(objectId, PRODUCT.MAX_CATEGORIES).optional(),
    brandId: objectId.nullable().optional(),
    supplierId: objectId.nullable().optional(),
    imageIds: uniqueList(objectId, PRODUCT.MAX_IMAGES).optional(),
    options: options.optional(),
    tags: uniqueList(
      plainText({ min: 1, max: 30 }).transform((t) => t.toLowerCase()),
      PRODUCT.MAX_TAGS,
    ).optional(),
    taxCategory: z.enum(PRODUCT.TAX_CATEGORIES, { error: V.INVALID_TYPE }).optional(),
    /** Validated on the server against the active `product` custom field definitions. */
    customFields: z.record(z.string(), z.unknown()).optional(),
    seo: z
      .object({
        title: plainText({ max: PRODUCT.SEO_TITLE_MAX }).optional(),
        description: plainText({ max: PRODUCT.SEO_DESCRIPTION_MAX }).optional(),
      })
      .strict()
      .optional(),
  };
  /** `isCreate`: missing options/images mean "none"; on update they mean "unchanged". */
  const aggregate = (isCreate) => (p, ctx) => {
    if (!p.variants) return;
    for (const i of productAggregateIssues({
      options: p.options ?? [],
      imageIds: isCreate ? (p.imageIds ?? []) : p.imageIds,
      variants: p.variants,
    })) {
      ctx.addIssue({ code: 'custom', path: i.path, message: i.message });
    }
  };

  return {
    idParam: z.object({ id: objectId }),
    slugParam: z.object({ slug }),
    listQuery: paginationQuery({
      sortable: ['updatedAt', 'createdAt', 'name', 'priceMin'],
      defaultSort: '-updatedAt',
    }).extend({
      q: plainText({ max: 100 }).optional(),
      status: z.enum(PRODUCT.STATUSES, { error: V.INVALID_TYPE }).optional(),
      categoryId: objectId.optional(),
      brandId: objectId.optional(),
      supplierId: objectId.optional(),
    }),
    create: z.object({ ...fields, variants }).superRefine(aggregate(true)),
    /** `variants`, when sent, is the COMPLETE set (missing existing variants are removed). */
    update: z
      .object({ ...fields, name: fields.name.optional(), variants: variants.optional() })
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED })
      .superRefine((p, ctx) => p.options && aggregate(false)(p, ctx)),
    publicQuery: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
  };
}
