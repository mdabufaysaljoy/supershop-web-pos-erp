import { describe, expect, it } from 'vitest';
import {
  createCustomFieldSchemas,
  createProductSchemas,
  customValuesSchema,
  variantOptionsKey,
} from '../index.js';

const ID = '64b000000000000000000001';

describe('product schemas', () => {
  const s = createProductSchemas();

  it('derives option/value keys from English and normalizes SKUs', () => {
    const r = s.create.parse({
      name: 'Shirt',
      imageIds: [ID],
      options: [{ name: 'Fit Type', values: [{ label: 'Slim Fit' }, { label: 'Regular' }] }],
      variants: [
        { sku: 'sh-slim', optionValues: { 'fit-type': 'slim-fit' }, price: 100, imageIds: [ID] },
        { sku: 'sh-reg', optionValues: { 'fit-type': 'regular' }, price: 100 },
      ],
    });
    expect(r.options[0]).toMatchObject({
      key: 'fit-type',
      values: [{ key: 'slim-fit' }, { key: 'regular' }],
    });
    expect(r.variants.map((v) => v.sku)).toEqual(['SH-SLIM', 'SH-REG']);
  });

  it('flags variant images missing from the gallery on create', () => {
    const r = s.create.safeParse({ name: 'X', variants: [{ sku: 'A', price: 1, imageIds: [ID] }] });
    expect(r.error.issues.map((i) => i.path.join('.'))).toEqual(['variants.0.imageIds']);
  });

  it('canonical option key is order-independent', () => {
    expect(variantOptionsKey({ size: 'm', color: 'red' })).toBe('color=red|size=m');
    expect(variantOptionsKey({})).toBe('');
  });
});

describe('custom field schemas', () => {
  it('definition rules: options only for select types, min ≤ max', () => {
    const { create } = createCustomFieldSchemas();
    const base = { entity: 'product', key: 'k', label: 'K' };
    expect(create.safeParse({ ...base, type: 'select' }).success).toBe(false);
    expect(
      create.safeParse({ ...base, type: 'text', options: [{ key: 'a', label: 'A' }] }).success,
    ).toBe(false);
    expect(create.safeParse({ ...base, type: 'number', min: 5, max: 1 }).success).toBe(false);
    expect(create.safeParse({ ...base, type: 'boolean', min: 1 }).success).toBe(false);
    expect(create.safeParse({ ...base, type: 'date' }).success).toBe(true);
  });

  it('value schema per type', () => {
    const v = customValuesSchema([
      { key: 'tags', type: 'multiselect', options: [{ key: 'a' }, { key: 'b' }], required: true },
      { key: 'made', type: 'date' },
      { key: 'gift', type: 'boolean' },
      { key: 'note', type: 'textarea', max: 5 },
    ]);
    expect(v.parse({ tags: ['a', 'a', 'b'], made: '2026-01-31', gift: true })).toEqual({
      tags: ['a', 'b'],
      made: '2026-01-31',
      gift: true,
    });
    expect(v.safeParse({ tags: [] }).success).toBe(false);
    expect(v.safeParse({ tags: ['a'], made: '2026-02-30' }).success).toBe(false);
    expect(v.safeParse({ tags: ['a'], note: 'too long' }).success).toBe(false);
    expect(v.safeParse({ tags: ['a'], note: '<b>' }).success).toBe(false);
  });
});
