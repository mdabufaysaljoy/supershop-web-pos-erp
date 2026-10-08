import { createProductSchemas } from '@supershop/shared';
import { describe, expect, it } from 'vitest';
import { combinations, comboLabel, emptyVariant, syncVariants, toForm, toPayload } from '../form';

const options = [
  {
    name: 'Color',
    values: [
      { label: 'Red', swatch: '#ff0000' },
      { label: 'Navy Blue', swatch: '' },
    ],
  },
  { name: 'Size', values: [{ label: 'M' }, { label: 'L' }] },
];

describe('variant matrix', () => {
  it('builds every combination with keys and generated SKUs', () => {
    const r = syncVariants({
      options,
      variants: [emptyVariant()],
      skuPrefix: '',
      defaultPrice: '49',
      name: 'Cotton Tee',
    });
    expect(r.options.map((o) => o.key)).toEqual(['color', 'size']);
    expect(r.variants.map((v) => v.sku)).toEqual([
      'COTTON-TEE-RED-M',
      'COTTON-TEE-RED-L',
      'COTTON-TEE-NAVY-BLUE-M',
      'COTTON-TEE-NAVY-BLUE-L',
    ]);
    expect(r.variants.every((v) => v.price === '49')).toBe(true);
    expect(comboLabel(r.variants[2].optionValues, r.options)).toBe('Navy Blue / M');
  });

  it('keeps existing rows when options change; drops removed combinations', () => {
    const first = syncVariants({
      options,
      variants: [],
      skuPrefix: 'TS',
      defaultPrice: '10',
      name: 'x',
    });
    first.variants[0] = { ...first.variants[0], id: 'v1', sku: 'CUSTOM', price: '12.50' };
    const next = structuredClone(first.options);
    next[1].values.pop(); // remove L
    next[0].values.push({ label: 'White' }); // add White
    const r = syncVariants({
      options: next,
      variants: first.variants,
      skuPrefix: 'TS',
      defaultPrice: '10',
      name: 'x',
    });
    expect(r.variants.map((v) => v.sku)).toEqual(['CUSTOM', 'TS-NAVY-BLUE-M', 'TS-WHITE-M']);
    expect(r.variants[0]).toMatchObject({ id: 'v1', price: '12.50' });
  });

  it('a key, once assigned, survives renames; incomplete options get no key', () => {
    const r1 = syncVariants({
      options: [
        { name: 'Colour', values: [{ label: 'Red' }] },
        { name: '', values: [{ label: 'X' }] },
      ],
      variants: [],
      name: 'p',
      defaultPrice: '',
    });
    expect(r1.options.map((o) => o.key)).toEqual(['colour', undefined]);
    const renamed = [{ ...r1.options[0], name: 'Shade' }];
    expect(
      syncVariants({ options: renamed, variants: r1.variants, name: 'p', defaultPrice: '' })
        .options[0].key,
    ).toBe('colour');
  });

  it('no options → a single default variant', () => {
    const r = syncVariants({
      options: [],
      variants: [emptyVariant({ id: 'v', sku: 'A' }), emptyVariant()],
      name: 'p',
      defaultPrice: '',
    });
    expect(r.variants).toEqual([expect.objectContaining({ id: 'v', sku: 'A', optionValues: {} })]);
    expect(combinations([])).toEqual([{}]);
  });
});

const C = '64b000000000000000000001';
const S = '64b000000000000000000002';
const I1 = '64b000000000000000000003';
const V1 = '64b000000000000000000004';

describe('payload', () => {
  it('converts money to halalas, omits cost without permission, passes the shared schema', () => {
    const f = {
      ...toForm(),
      name: 'Rice',
      variants: [{ ...emptyVariant(), sku: 'rice', price: '34.5', cost: '20' }],
    };
    const withCost = toPayload(f, { canViewCost: true, defs: [] });
    expect(withCost.variants[0]).toMatchObject({ price: 3450, cost: 2000, compareAtPrice: null });
    const without = toPayload(f, { canViewCost: false, defs: [] });
    expect(without.variants[0]).not.toHaveProperty('cost');
    expect(createProductSchemas().create.safeParse(without).success).toBe(true);

    const bad = toPayload(
      { ...f, variants: [{ ...f.variants[0], price: '1.234' }] },
      { canViewCost: false, defs: [] },
    );
    const issues = createProductSchemas().create.safeParse(bad).error.issues;
    expect(issues[0].path.join('.')).toBe('variants.0.price');
  });

  it('custom values: numbers parsed, empties dropped; round-trips an API product', () => {
    const defs = [
      { key: 'months', type: 'number' },
      { key: 'note', type: 'text' },
      { key: 'tags', type: 'multiselect' },
    ];
    const f = { ...toForm(), name: 'X', customFields: { months: '12', note: '', tags: [] } };
    expect(toPayload(f, { canViewCost: false, defs }).customFields).toEqual({ months: 12 });

    const api = {
      id: 'p1',
      name: { en: 'Tee' },
      slug: 'tee',
      shortDescription: { en: '' },
      description: { en: 'D' },
      status: 'active',
      taxCategory: 'standard',
      categoryIds: [C],
      brandId: null,
      supplierId: S,
      tags: ['summer'],
      images: [{ id: I1, url: 'u', thumbUrl: 't', width: 1, height: 1 }],
      options: [
        {
          key: 'size',
          name: { en: 'Size' },
          values: [{ key: 'm', label: { en: 'M' }, swatch: null }],
        },
      ],
      variants: [
        {
          id: V1,
          sku: 'TEE-M',
          barcode: null,
          optionValues: { size: 'm' },
          price: 4900,
          compareAtPrice: null,
          cost: 2000,
          imageIds: [I1],
          weightGrams: 200,
          isActive: true,
        },
      ],
      customFields: {},
      seo: { title: { en: 'T' }, description: { en: '' } },
    };
    const payload = toPayload(toForm(api), { canViewCost: true, defs: [] });
    expect(payload).toMatchObject({
      slug: 'tee',
      supplierId: S,
      brandId: null,
      imageIds: [I1],
      options: [{ key: 'size', name: 'Size', values: [{ key: 'm', label: 'M', swatch: null }] }],
      variants: [{ id: V1, sku: 'TEE-M', barcode: '', price: 4900, cost: 2000, weightGrams: 200 }],
    });
    const parsed = createProductSchemas().update.safeParse(payload);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });
});
