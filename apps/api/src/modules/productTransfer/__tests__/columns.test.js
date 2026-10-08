import { describe, expect, it } from 'vitest';
import { buildProductInput, columnsFor, groupRows, locate, productRows } from '../columns.js';

const headers = [
  'product_key',
  'name',
  'categories',
  'brand',
  'option1_name',
  'option1_value',
  'sku',
  'price',
  'cost',
  'variant_active',
  'cf.material',
];
const row = (line, values) => ({ line, cells: headers.map((h) => values[h] ?? '') });
const defs = [
  {
    key: 'material',
    type: 'select',
    isActive: true,
    options: [{ key: 'cotton', label: { en: 'Cotton' } }],
  },
];
const ctx = (extra = {}) => ({
  existing: null,
  categoriesBySlug: new Map([['men', 'C1']]),
  brandsByKey: new Map([['zentra', 'B1']]),
  suppliersByKey: new Map(),
  defs,
  canViewCost: true,
  hasColumn: (c) => headers.includes(c),
  ...extra,
});

describe('import mapping', () => {
  it('groups variant rows and builds a new product with options', () => {
    const { groups, errors } = groupRows(headers, [
      row(2, {
        product_key: 'Tee',
        name: 'Tee',
        categories: 'men',
        brand: 'Zentra',
        option1_name: 'Size',
        option1_value: 'M',
        sku: 'tee-m',
        price: '49',
        cost: '20',
        'cf.material': 'Cotton',
      }),
      row(3, {
        product_key: 'tee',
        option1_value: 'L',
        sku: 'TEE-L',
        price: '49.50',
        variant_active: 'no',
      }),
      row(4, { sku: 'ORPHAN', price: '1' }),
    ]);
    expect(errors).toEqual([{ row: 4, column: 'product_key', message: 'validation.required' }]);
    const { input, variantLines, errors: e2 } = buildProductInput('tee', groups.get('tee'), ctx());
    expect(e2).toEqual([]);
    expect(variantLines).toEqual([2, 3]);
    expect(input).toMatchObject({
      slug: 'tee',
      name: 'Tee',
      categoryIds: ['C1'],
      brandId: 'B1',
      customFields: { material: 'cotton' },
      options: [
        {
          key: 'size',
          name: 'Size',
          values: [
            { key: 'm', label: 'M' },
            { key: 'l', label: 'L' },
          ],
        },
      ],
      variants: [
        { sku: 'TEE-M', optionValues: { size: 'm' }, price: 4900, cost: 2000, isActive: true },
        { sku: 'TEE-L', optionValues: { size: 'l' }, price: 4950, isActive: false },
      ],
    });
  });

  it('merges into an existing product: keys kept, unlisted variants kept, missing cost unchanged', () => {
    const existing = {
      id: 'P1',
      customFields: { material: 'cotton', other: 'x' },
      options: [
        {
          key: 'size',
          name: { en: 'Size' },
          values: [
            { key: 'm', label: { en: 'M' } },
            { key: 'xl', label: { en: 'Extra Large' } },
          ],
        },
      ],
      variants: [
        {
          id: 'V1',
          sku: 'TEE-M',
          barcode: null,
          optionValues: { size: 'm' },
          price: 4900,
          compareAtPrice: null,
          cost: 2000,
          imageIds: ['I1'],
          weightGrams: null,
          isActive: true,
        },
        {
          id: 'V2',
          sku: 'TEE-XL',
          barcode: '2000000000015',
          optionValues: { size: 'xl' },
          price: 5200,
          compareAtPrice: null,
          cost: 2500,
          imageIds: [],
          weightGrams: 300,
          isActive: true,
        },
      ],
    };
    const priceOnly = ['product_key', 'option1_name', 'option1_value', 'sku', 'price'];
    const { groups } = groupRows(priceOnly, [
      { line: 2, cells: ['tee', 'size', 'extra large', 'TEE-XL', '55'] },
    ]);
    const { input } = buildProductInput(
      'tee',
      groups.get('tee'),
      ctx({ existing, hasColumn: (c) => priceOnly.includes(c) }),
    );
    expect(input).not.toHaveProperty('slug');
    expect(input).not.toHaveProperty('options'); // same option values (case-insensitive) → untouched
    expect(input).not.toHaveProperty('customFields');
    expect(input.variants).toEqual([
      expect.objectContaining({
        id: 'V2',
        sku: 'TEE-XL',
        optionValues: { size: 'xl' },
        price: 5500,
        barcode: '2000000000015',
        weightGrams: 300,
      }),
      expect.objectContaining({ id: 'V1', sku: 'TEE-M', price: 4900, imageIds: ['I1'] }),
    ]);
    expect(input.variants.every((v) => !('cost' in v))).toBe(true);
  });

  it('collects cell errors and maps API paths back to cells', () => {
    const { groups } = groupRows(headers, [
      row(5, {
        product_key: 'x',
        name: 'X',
        categories: 'nope',
        brand: 'ghost',
        sku: 'X1',
        price: '1.234',
        variant_active: 'maybe',
      }),
    ]);
    const { errors } = buildProductInput('x', groups.get('x'), ctx());
    expect(errors).toEqual([
      { row: 5, column: 'categories', message: 'validation.import.unknownReference' },
      { row: 5, column: 'brand', message: 'validation.import.unknownReference' },
      { row: 5, column: 'price', message: 'validation.money.invalid' },
      { row: 5, column: 'variant_active', message: 'validation.invalidType' },
    ]);
    const where = { firstLine: 10, variantLines: [10, 11] };
    expect(locate('variants.1.compareAtPrice', where)).toEqual({
      row: 11,
      column: 'compare_at_price',
    });
    expect(locate('customFields.material', where)).toEqual({ row: 10, column: 'cf.material' });
    expect(locate('seo.title', where)).toEqual({ row: 10, column: 'seo_title' });
    expect(locate('options.1.values.0.key', where)).toEqual({ row: 10, column: 'option2_value' });
    expect(locate('categoryIds.0', where)).toEqual({ row: 10, column: 'categories' });
  });
});

describe('export mapping', () => {
  it('one row per variant; cost only when the column is present', () => {
    const p = {
      slug: 'tee',
      name: { en: 'Tee' },
      shortDescription: { en: '' },
      description: { en: '' },
      status: 'active',
      taxCategory: 'standard',
      categoryIds: ['C1'],
      brandId: 'B1',
      supplierId: null,
      tags: ['a', 'b'],
      seo: { title: { en: '' }, description: { en: '' } },
      options: [{ key: 'size', name: { en: 'Size' }, values: [{ key: 'm', label: { en: 'M' } }] }],
      customFields: { material: 'cotton' },
      variants: [
        {
          sku: 'TEE-M',
          barcode: null,
          optionValues: { size: 'm' },
          price: 4900,
          compareAtPrice: 5900,
          cost: 2000,
          weightGrams: null,
          isActive: true,
        },
      ],
    };
    const lookups = {
      categorySlugs: new Map([['C1', 'men']]),
      brandNames: new Map([['B1', 'Zentra']]),
      supplierNames: new Map(),
      defs,
    };
    const withCost = columnsFor({ defs, canViewCost: true });
    const [r] = productRows(p, { ...lookups, columns: withCost });
    const cell = (c) => r[withCost.indexOf(c)];
    expect([
      cell('product_key'),
      cell('categories'),
      cell('brand'),
      cell('tags'),
      cell('option1_value'),
      cell('price'),
      cell('compare_at_price'),
      cell('cost'),
      cell('cf.material'),
    ]).toEqual(['tee', 'men', 'Zentra', 'a|b', 'M', '49.00', '59.00', '20.00', 'cotton']);
    expect(columnsFor({ defs, canViewCost: false })).not.toContain('cost');
  });
});
