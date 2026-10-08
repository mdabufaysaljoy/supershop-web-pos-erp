import { deriveOptionKeys, fromMinor, toMinor, variantOptionsKey } from '@supershop/shared';
import { validators } from '@supershop/shared';

/**
 * Product editor state ⇄ API payload, and the variant matrix generator. Pure functions (unit
 * tested); the React components only hold the state.
 *
 * Form money values are strings in MAJOR units ("49.00"); the payload carries integer halalas.
 */

const money = (minor) => (minor == null ? '' : fromMinor(minor));

export const emptyVariant = (extra = {}) => ({
  id: undefined,
  sku: '',
  barcode: '',
  optionValues: {},
  price: '',
  compareAtPrice: '',
  cost: '',
  imageIds: [],
  weightGrams: '',
  isActive: true,
  ...extra,
});

/** API product DTO (or nothing for a new product) → editor state. */
export function toForm(p) {
  if (!p) {
    return {
      name: '',
      slug: '',
      shortDescription: '',
      description: '',
      status: 'draft',
      taxCategory: 'standard',
      categoryIds: [],
      brandId: '',
      supplierId: '',
      tags: [],
      images: [],
      options: [],
      variants: [emptyVariant()],
      customFields: {},
      seoTitle: '',
      seoDescription: '',
      skuPrefix: '',
      defaultPrice: '',
    };
  }
  return {
    name: p.name.en,
    slug: p.slug,
    shortDescription: p.shortDescription?.en ?? '',
    description: p.description?.en ?? '',
    status: p.status,
    taxCategory: p.taxCategory,
    categoryIds: p.categoryIds,
    brandId: p.brandId ?? '',
    supplierId: p.supplierId ?? '',
    tags: p.tags,
    images: p.images.map(({ id, url, thumbUrl }) => ({ id, url, thumbUrl })),
    options: p.options.map((o) => ({
      key: o.key,
      name: o.name.en,
      values: o.values.map((v) => ({ key: v.key, label: v.label.en, swatch: v.swatch ?? '' })),
    })),
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode ?? '',
      optionValues: v.optionValues,
      price: money(v.price),
      compareAtPrice: money(v.compareAtPrice),
      cost: 'cost' in v ? money(v.cost) : '',
      imageIds: v.imageIds,
      weightGrams: v.weightGrams == null ? '' : String(v.weightGrams),
      isActive: v.isActive,
    })),
    customFields: p.customFields ?? {},
    seoTitle: p.seo?.title?.en ?? '',
    seoDescription: p.seo?.description?.en ?? '',
    skuPrefix: '',
    defaultPrice: '',
  };
}

/** "12.50" → 1250; invalid input passes through unchanged so the schema reports it on the field. */
const toMoney = (value) => {
  if (value === '' || value == null) return null;
  try {
    return toMinor(value);
  } catch {
    return value;
  }
};
const toInt = (value) => (value === '' || value == null ? null : Number(value));

/** Custom field values: drop empties, numbers from strings. */
function customPayload(values, defs) {
  const out = {};
  for (const def of defs) {
    let v = values[def.key];
    if (v === undefined || v === '' || v === null) continue;
    if (def.type === 'number') v = Number.isNaN(Number(v)) ? v : Number(v);
    if (def.type === 'multiselect' && !v.length) continue;
    out[def.key] = v;
  }
  return out;
}

/**
 * Editor state → API body. Cost is sent only when the user may see costs (otherwise it is left
 * out entirely, which keeps the stored cost).
 * @param {ReturnType<typeof toForm>} f
 * @param {{ canViewCost: boolean, defs: object[] }} ctx
 */
export function toPayload(f, { canViewCost, defs }) {
  return {
    name: f.name,
    ...(f.slug && { slug: f.slug }),
    shortDescription: f.shortDescription,
    description: f.description,
    status: f.status,
    taxCategory: f.taxCategory,
    categoryIds: f.categoryIds,
    brandId: f.brandId || null,
    supplierId: f.supplierId || null,
    tags: f.tags,
    imageIds: f.images.map((i) => i.id),
    options: f.options.map((o) => ({
      ...(o.key && { key: o.key }),
      name: o.name,
      values: o.values.map((v) => ({
        ...(v.key && { key: v.key }),
        label: v.label,
        swatch: v.swatch || null,
      })),
    })),
    variants: f.variants.map((v) => ({
      ...(v.id && { id: v.id }),
      sku: v.sku,
      barcode: v.barcode,
      optionValues: v.optionValues,
      price: toMoney(v.price) ?? v.price,
      compareAtPrice: toMoney(v.compareAtPrice),
      ...(canViewCost && { cost: toMoney(v.cost) }),
      imageIds: v.imageIds,
      weightGrams: toInt(v.weightGrams),
      isActive: v.isActive,
    })),
    customFields: customPayload(f.customFields, defs),
    seo: { title: f.seoTitle, description: f.seoDescription },
  };
}

/** Every combination of option values, in option order: `[{ color: 'red', size: 'm' }, …]`. */
export function combinations(options) {
  return options.reduce(
    (acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.key]: v.key }))),
    [{}],
  );
}

const skuPart = (s) =>
  validators
    .toSlug(s)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');

/**
 * Rebuilds the variant rows for the current options. Rows whose combination still exists are
 * kept untouched (id, SKU, prices…); new combinations get `PREFIX-VALUE-VALUE` SKUs and the
 * default price; rows for removed combinations are dropped. Options get their keys first.
 * @returns {{ options: object[], variants: object[] }}
 */
export function syncVariants({ options, variants, skuPrefix, defaultPrice, name }) {
  const complete = (o) => o.name.trim() && o.values.length > 0;
  // Keys are fixed the first time an option is complete (later renames keep them).
  const withKeys = options.map((o) => (complete(o) ? deriveOptionKeys([o])[0] : o));
  const keyed = withKeys.filter(complete);
  if (!keyed.length) {
    const first = variants[0] ?? emptyVariant({ price: defaultPrice });
    return { options: withKeys, variants: [{ ...first, optionValues: {} }] };
  }
  const existing = new Map(variants.map((v) => [variantOptionsKey(v.optionValues), v]));
  const prefix = skuPart(skuPrefix || name).slice(0, 24) || 'SKU';
  const rows = combinations(keyed).map((combo) => {
    const kept = existing.get(variantOptionsKey(combo));
    if (kept) return { ...kept, optionValues: combo };
    const suffix = keyed.map((o) => skuPart(combo[o.key])).join('-');
    return emptyVariant({
      sku: `${prefix}-${suffix}`.slice(0, 64),
      optionValues: combo,
      price: defaultPrice,
    });
  });
  return { options: withKeys, variants: rows };
}

/** "Red / M" for a variant row. */
export const comboLabel = (optionValues, options) =>
  options
    .map((o) => o.values.find((v) => v.key === optionValues[o.key])?.label)
    .filter(Boolean)
    .join(' / ');
