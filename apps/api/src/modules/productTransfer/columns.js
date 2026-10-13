import {
  deriveOptionKeys,
  fromMinor,
  normalizeDigits,
  PRODUCT,
  toMinor,
  variantOptionsKey,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';

/**
 * Spreadsheet layout for products (one row per VARIANT; rows sharing `product_key` form one
 * product). Pure functions: rows ⇄ product payloads/DTOs, and API error paths → row/column.
 *
 * Conventions: lists use `|` (categories, tags, multi-choice); money is in SAR with up to 2
 * decimals; product-level cells are read from the first row of a product that has a value; a
 * column left out of the file keeps the stored value, an empty cell clears it.
 */
export const LIST_SEP = '|';
const OPTION_SLOTS = [1, 2, 3];
export const CF_PREFIX = 'cf.';

export const PRODUCT_COLUMNS = [
  'product_key',
  'name',
  'short_description',
  'description',
  'status',
  'tax_category',
  'categories',
  'brand',
  'supplier',
  'tags',
  'seo_title',
  'seo_description',
  ...OPTION_SLOTS.flatMap((n) => [`option${n}_name`, `option${n}_value`]),
];
export const VARIANT_COLUMNS = [
  'sku',
  'barcode',
  'price',
  'compare_at_price',
  'cost',
  'weight_grams',
  'variant_active',
];

/** Column list for templates/exports (cost only for staff who may see it). */
export function columnsFor({ defs, canViewCost }) {
  return [
    ...PRODUCT_COLUMNS,
    ...VARIANT_COLUMNS.filter((c) => c !== 'cost' || canViewCost),
    ...defs.filter((d) => d.isActive).map((d) => `${CF_PREFIX}${d.key}`),
  ];
}

/** English help for the template's Instructions sheet. */
export const COLUMN_NOTES = [
  [
    'product_key',
    'Required. The product URL slug (a-z, 0-9, -). Rows with the same key are variants of one product; an existing key updates that product.',
  ],
  [
    'name',
    'Product name in English (required for new products). Arabic is generated automatically.',
  ],
  ['status', 'draft, active or archived (default draft).'],
  ['tax_category', 'standard, zero or exempt (default standard).'],
  ['categories', 'Category slugs separated by |. The first is the main category.'],
  ['brand / supplier', 'Existing brand name or slug / supplier name.'],
  ['tags', 'Separated by |.'],
  [
    'option1_name … option3_value',
    'Up to 3 options. Put the option names (e.g. Color) and each row’s value (e.g. Red). Leave empty for a product without options.',
  ],
  ['sku', 'Required, unique. A–Z, 0–9, - _ .'],
  ['barcode', 'Optional, unique. EAN/UPC numbers must have a correct check digit.'],
  ['price / compare_at_price / cost', 'In SAR, e.g. 49.50. Cost needs the "view cost" permission.'],
  ['variant_active', 'yes/no (default yes).'],
  [
    'cf.<key>',
    'Custom fields. Dropdowns take the choice key or English label; multiple choices separated by |; dates as YYYY-MM-DD; yes/no for checkboxes.',
  ],
  ['Images', 'Not imported — add images in the product editor.'],
];

const camelToColumn = {
  name: 'name',
  slug: 'product_key',
  shortDescription: 'short_description',
  description: 'description',
  status: 'status',
  taxCategory: 'tax_category',
  categoryIds: 'categories',
  brandId: 'brand',
  supplierId: 'supplier',
  tags: 'tags',
  'seo.title': 'seo_title',
  'seo.description': 'seo_description',
  options: 'option1_name',
  sku: 'sku',
  barcode: 'barcode',
  price: 'price',
  compareAtPrice: 'compare_at_price',
  cost: 'cost',
  weightGrams: 'weight_grams',
  isActive: 'variant_active',
  optionValues: 'option1_value',
  imageIds: 'sku',
  id: 'sku',
};

/**
 * Maps an API/zod error path to the spreadsheet cell it came from.
 * @param {string} path e.g. 'variants.2.price', 'customFields.material', 'categoryIds.0'
 * @param {{ firstLine: number, variantLines: number[] }} where
 */
export function locate(path, { firstLine, variantLines }) {
  const parts = (path ?? '').split('.');
  if (parts[0] === 'variants' && /^\d+$/.test(parts[1] ?? '')) {
    const line = variantLines[Number(parts[1])] ?? firstLine;
    return { row: line, column: camelToColumn[parts[2]] ?? 'sku' };
  }
  if (parts[0] === 'customFields') return { row: firstLine, column: `${CF_PREFIX}${parts[1]}` };
  if (parts[0] === 'options') {
    const n = Number(parts[1] ?? 0) + 1;
    return {
      row: firstLine,
      column: parts[2] === 'values' ? `option${n}_value` : `option${n}_name`,
    };
  }
  const key = parts[0] === 'seo' ? path : parts[0];
  return { row: firstLine, column: camelToColumn[key] ?? (parts[0] || 'product_key') };
}

// ---------------------------------------------------------------- parsing helpers

const clean = (v) => (v ?? '').trim();
const BOOL = {
  true: true,
  yes: true,
  y: true,
  1: true,
  false: false,
  no: false,
  n: false,
  0: false,
};
const parseBool = (v) => BOOL[normalizeDigits(clean(v)).toLowerCase()];
const splitList = (v) =>
  clean(v)
    .split(LIST_SEP)
    .map((x) => x.trim())
    .filter(Boolean);
const moneyOrError = (raw, column, line, errors) => {
  const v = clean(raw);
  if (!v) return null;
  try {
    return toMinor(v);
  } catch {
    errors.push({ row: line, column, message: V.MONEY_INVALID });
    return undefined;
  }
};

/**
 * Groups data rows into products by `product_key` (lower-cased).
 * @param {string[]} headers
 * @param {{ line: number, cells: string[] }[]} rows
 */
export function groupRows(headers, rows) {
  const index = new Map(headers.map((h, i) => [h, i]));
  const groups = new Map();
  const errors = [];
  for (const r of rows) {
    const get = (col) => (index.has(col) ? (r.cells[index.get(col)] ?? '') : undefined);
    const key = clean(get('product_key')).toLowerCase();
    if (!key) {
      errors.push({ row: r.line, column: 'product_key', message: V.REQUIRED });
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ line: r.line, get });
  }
  return { groups, errors };
}

/** First non-empty value of a product-level column in the group ('' if present but empty). */
const firstValue = (group, col) => {
  for (const row of group) {
    const v = row.get(col);
    if (v !== undefined && clean(v) !== '') return clean(v);
  }
  return group[0].get(col) === undefined ? undefined : '';
};

function parseCustomValue(def, raw) {
  const v = clean(raw);
  if (v === '') return { value: undefined };
  const byKeyOrLabel = (x) =>
    def.options.find((o) => o.key === x || o.label.en.toLowerCase() === x.toLowerCase())?.key ?? x;
  switch (def.type) {
    case 'number': {
      const n = Number(normalizeDigits(v));
      return Number.isFinite(n) ? { value: n } : { error: V.INVALID_TYPE };
    }
    case 'boolean': {
      const b = parseBool(v);
      return b === undefined ? { error: V.INVALID_TYPE } : { value: b };
    }
    case 'select':
      return { value: byKeyOrLabel(v) };
    case 'multiselect':
      return { value: splitList(v).map(byKeyOrLabel) };
    default:
      return { value: v };
  }
}

/** Existing option DTOs → editable input shape. */
const optionInput = (options = []) =>
  options.map((o) => ({
    key: o.key,
    name: o.name.en,
    values: o.values.map((v) => ({ key: v.key, label: v.label.en, swatch: v.swatch ?? null })),
  }));

/**
 * Builds the create/update payload for one product group.
 * @param {string} key product_key
 * @param {{ line: number, get: (col: string) => string | undefined }[]} group
 * @param {{ existing: object | null, categoriesBySlug: Map, brandsByKey: Map, suppliersByKey: Map,
 *   defs: object[], canViewCost: boolean, hasColumn: (c: string) => boolean }} ctx
 * @returns {{ input: object, variantLines: number[], errors: { row: number, column: string, message: string }[] }}
 */
export function buildProductInput(key, group, ctx) {
  const { existing, hasColumn } = ctx;
  const errors = [];
  const firstLine = group[0].line;
  const input = existing ? {} : { slug: key };
  const text = (col, field) => {
    const v = firstValue(group, col);
    if (v !== undefined && (v !== '' || existing)) input[field] = v;
  };

  text('name', 'name');
  text('short_description', 'shortDescription');
  text('description', 'description');
  const lower = (col, field) => {
    const v = firstValue(group, col);
    if (v) input[field] = v.toLowerCase();
  };
  lower('status', 'status');
  lower('tax_category', 'taxCategory');

  if (hasColumn('categories')) {
    input.categoryIds = [];
    for (const slug of splitList(firstValue(group, 'categories'))) {
      const id = ctx.categoriesBySlug.get(slug.toLowerCase());
      if (id) input.categoryIds.push(id);
      else errors.push({ row: firstLine, column: 'categories', message: V.UNKNOWN_REFERENCE });
    }
  }
  const ref = (col, field, map) => {
    if (!hasColumn(col)) return;
    const v = firstValue(group, col);
    if (!v) {
      input[field] = null;
      return;
    }
    const id = map.get(v.toLowerCase());
    if (id) input[field] = id;
    else errors.push({ row: firstLine, column: col, message: V.UNKNOWN_REFERENCE });
  };
  ref('brand', 'brandId', ctx.brandsByKey);
  ref('supplier', 'supplierId', ctx.suppliersByKey);
  if (hasColumn('tags'))
    input.tags = [...new Set(splitList(firstValue(group, 'tags')).map((t) => t.toLowerCase()))];
  const seoTitle = firstValue(group, 'seo_title');
  const seoDescription = firstValue(group, 'seo_description');
  if (seoTitle !== undefined || seoDescription !== undefined) {
    input.seo = {
      ...(seoTitle !== undefined && { title: seoTitle }),
      ...(seoDescription !== undefined && { description: seoDescription }),
    };
  }

  // Custom fields: merge over stored values (columns left out keep their value).
  const cfColumns = ctx.defs.filter((d) => d.isActive && hasColumn(`${CF_PREFIX}${d.key}`));
  if (cfColumns.length) {
    const values = { ...(existing?.customFields ?? {}) };
    for (const def of cfColumns) {
      const parsed = parseCustomValue(def, firstValue(group, `${CF_PREFIX}${def.key}`));
      if (parsed.error)
        errors.push({ row: firstLine, column: `${CF_PREFIX}${def.key}`, message: parsed.error });
      else if (parsed.value === undefined) delete values[def.key];
      else values[def.key] = parsed.value;
    }
    input.customFields = values;
  }

  // Options: file names/values merged into the stored options (existing keys are kept).
  const options = optionInput(existing?.options);
  const slots = OPTION_SLOTS.map((n) => ({ n, name: firstValue(group, `option${n}_name`) })).filter(
    (s) => s.name,
  );
  const slotOption = new Map();
  for (const { n, name } of slots) {
    let opt = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (!opt) {
      opt = { name, values: [] };
      options.push(opt);
    }
    slotOption.set(n, opt);
    for (const row of group) {
      const label = clean(row.get(`option${n}_value`));
      if (label && !opt.values.some((v) => v.label.toLowerCase() === label.toLowerCase())) {
        opt.values.push({ label, swatch: null });
      }
    }
  }
  const keyed = deriveOptionKeys(options);
  const optionsChanged =
    slots.length > 0 && JSON.stringify(keyed) !== JSON.stringify(optionInput(existing?.options));
  if (optionsChanged || (!existing && keyed.length)) input.options = keyed;

  // Variants: rows matched to stored variants by SKU; stored variants not in the file are kept.
  const stored = new Map((existing?.variants ?? []).map((v) => [v.sku, v]));
  const variants = [];
  const variantLines = [];
  for (const row of group) {
    const sku = normalizeDigits(clean(row.get('sku'))).toUpperCase();
    const optionValues = {};
    for (const { n } of slots) {
      const opt = keyed[options.indexOf(slotOption.get(n))];
      const label = clean(row.get(`option${n}_value`));
      const value = opt.values.find((v) => v.label.toLowerCase() === label.toLowerCase());
      if (value) optionValues[opt.key] = value.key;
    }
    const old = stored.get(sku);
    const price = moneyOrError(row.get('price'), 'price', row.line, errors);
    const variant = {
      ...(old && { id: old.id }),
      sku,
      barcode: hasColumn('barcode') ? clean(row.get('barcode')) : (old?.barcode ?? ''),
      optionValues: slots.length ? optionValues : (old?.optionValues ?? {}),
      price: price ?? old?.price ?? clean(row.get('price')),
      compareAtPrice: hasColumn('compare_at_price')
        ? moneyOrError(row.get('compare_at_price'), 'compare_at_price', row.line, errors)
        : (old?.compareAtPrice ?? null),
      imageIds: old?.imageIds ?? [],
      weightGrams: hasColumn('weight_grams')
        ? clean(row.get('weight_grams'))
          ? Number(normalizeDigits(clean(row.get('weight_grams'))))
          : null
        : (old?.weightGrams ?? null),
      isActive:
        hasColumn('variant_active') && clean(row.get('variant_active'))
          ? (parseBool(row.get('variant_active')) ?? 'invalid')
          : (old?.isActive ?? true),
    };
    if (variant.isActive === 'invalid')
      errors.push({ row: row.line, column: 'variant_active', message: V.INVALID_TYPE });
    if (hasColumn('cost') && ctx.canViewCost) {
      const cost = moneyOrError(row.get('cost'), 'cost', row.line, errors);
      if (cost !== undefined) variant.cost = cost;
    }
    variants.push(variant);
    variantLines.push(row.line);
    stored.delete(sku);
  }
  // Keep stored variants that the file doesn't mention (cost omitted → unchanged).
  for (const v of stored.values()) {
    variants.push({
      id: v.id,
      sku: v.sku,
      barcode: v.barcode ?? '',
      optionValues: v.optionValues,
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      imageIds: v.imageIds,
      weightGrams: v.weightGrams ?? null,
      isActive: v.isActive,
    });
    variantLines.push(firstLine);
  }
  input.variants = variants;
  return { input, variantLines, errors };
}

// ---------------------------------------------------------------- export

/**
 * One row per variant (product cells repeated on every row so filtered sheets stay usable).
 * @param {object} p admin product DTO
 * @param {{ columns: string[], categorySlugs: Map, brandNames: Map, supplierNames: Map, defs: object[] }} ctx
 */
export function productRows(p, { columns, categorySlugs, brandNames, supplierNames, defs }) {
  const money = (m) => (m == null ? '' : fromMinor(m));
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const productCells = {
    product_key: p.slug,
    name: p.name.en,
    short_description: p.shortDescription?.en ?? '',
    description: p.description?.en ?? '',
    status: p.status,
    tax_category: p.taxCategory,
    categories: p.categoryIds
      .map((id) => categorySlugs.get(id))
      .filter(Boolean)
      .join(LIST_SEP),
    brand: p.brandId ? (brandNames.get(p.brandId) ?? '') : '',
    supplier: p.supplierId ? (supplierNames.get(p.supplierId) ?? '') : '',
    tags: p.tags.join(LIST_SEP),
    seo_title: p.seo?.title?.en ?? '',
    seo_description: p.seo?.description?.en ?? '',
  };
  p.options.slice(0, PRODUCT.MAX_OPTIONS).forEach((o, i) => {
    productCells[`option${i + 1}_name`] = o.name.en;
  });
  for (const [key, value] of Object.entries(p.customFields ?? {})) {
    const def = defByKey.get(key);
    if (!def) continue;
    productCells[`${CF_PREFIX}${key}`] = Array.isArray(value)
      ? value.join(LIST_SEP)
      : typeof value === 'boolean'
        ? value
          ? 'yes'
          : 'no'
        : String(value);
  }
  return p.variants.map((v) => {
    const cells = {
      ...productCells,
      sku: v.sku,
      barcode: v.barcode ?? '',
      price: money(v.price),
      compare_at_price: money(v.compareAtPrice),
      cost: 'cost' in v ? money(v.cost) : '',
      weight_grams: v.weightGrams ?? '',
      variant_active: v.isActive ? 'yes' : 'no',
    };
    p.options.slice(0, PRODUCT.MAX_OPTIONS).forEach((o, i) => {
      cells[`option${i + 1}_value`] =
        o.values.find((x) => x.key === v.optionValues[o.key])?.label.en ?? '';
    });
    return columns.map((c) => cells[c] ?? '');
  });
}

/** Two example rows for the template (a simple product and a product with a size option). */
export const exampleRows = (columns) =>
  [
    {
      product_key: 'basmati-rice-5kg',
      name: 'Basmati Rice 5kg',
      status: 'active',
      sku: 'RICE-5KG',
      price: '34.50',
      variant_active: 'yes',
    },
    {
      product_key: 'cotton-tee',
      name: 'Cotton T-Shirt',
      status: 'draft',
      option1_name: 'Size',
      option1_value: 'M',
      sku: 'TEE-M',
      price: '49.00',
      variant_active: 'yes',
    },
    {
      product_key: 'cotton-tee',
      option1_value: 'L',
      sku: 'TEE-L',
      price: '49.00',
      variant_active: 'yes',
    },
  ].map((r) => columns.map((c) => r[c] ?? ''));

/** Same canonical combination helper the products module uses (for tests/debugging). */
export { variantOptionsKey };
