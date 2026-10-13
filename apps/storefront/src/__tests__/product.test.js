import { describe, expect, it } from 'vitest';
import { pageWindow } from '@/components/catalog/ListingPagination';
import {
  galleryFor,
  initialSelection,
  selectedVariant,
  selectionWith,
  valueState,
} from '@/components/product/variants';
import { productLd } from '@/lib/structuredData';

const v = (id, color, size, extra = {}) => ({
  id,
  sku: `SKU-${id}`,
  optionValues: { color, size },
  price: 5000,
  compareAtPrice: null,
  imageIds: [],
  inStock: true,
  ...extra,
});
const product = {
  name: 'Oxford <Shirt>',
  shortDescription: 'Cotton',
  description: '',
  brand: { name: 'Zentra' },
  images: [
    { id: 'i1', url: 'https://cdn/1.webp' },
    { id: 'i2', url: 'https://cdn/2.webp' },
    { id: 'i3', url: 'https://cdn/3.webp' },
  ],
  options: [
    { key: 'color', values: [{ key: 'red' }, { key: 'blue' }] },
    { key: 'size', values: [{ key: 'm' }, { key: 'l' }] },
  ],
  variants: [
    v('a', 'red', 'm', { inStock: false }),
    v('b', 'red', 'l', { imageIds: ['i3', 'i2'] }),
    v('c', 'blue', 'm', { inStock: false, price: 6000 }),
  ],
  priceMin: 5000,
  priceMax: 6000,
  inStock: true,
};

describe('variant selection', () => {
  it('starts on the URL variant, else the first in stock', () => {
    expect(initialSelection(product, 'c')).toEqual({ color: 'blue', size: 'm' });
    expect(initialSelection(product, 'zzz')).toEqual({ color: 'red', size: 'l' });
  });

  it('finds the variant only when every option is chosen', () => {
    expect(selectedVariant(product, { color: 'red', size: 'l' }).id).toBe('b');
    expect(selectedVariant(product, { color: 'red' })).toBeNull();
    expect(
      selectedVariant({ ...product, options: [], variants: [product.variants[1]] }, {}).id,
    ).toBe('b');
  });

  it('marks values unavailable (no combination) or out of stock', () => {
    const sel = { color: 'blue', size: 'm' };
    expect(valueState(product, sel, 'size', 'l')).toBe('unavailable'); // blue/l doesn't exist
    expect(valueState(product, sel, 'color', 'red')).toBe('out'); // red/m out of stock
    expect(valueState(product, { color: 'red', size: 'l' }, 'size', 'l')).toBe('ok');
  });

  it('keeps other choices when possible, else jumps to a variant with the picked value', () => {
    expect(selectionWith(product, { color: 'red', size: 'm' }, 'size', 'l')).toEqual({
      color: 'red',
      size: 'l',
    });
    // blue only exists in size m → switches size too
    expect(selectionWith(product, { color: 'red', size: 'l' }, 'color', 'blue')).toEqual({
      color: 'blue',
      size: 'm',
    });
  });

  it("puts the variant's own images first", () => {
    expect(galleryFor(product, product.variants[1]).map((i) => i.id)).toEqual(['i3', 'i2', 'i1']);
    expect(galleryFor(product, null).map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
  });
});

describe('pagination window', () => {
  it('shows first, last and neighbours with gaps', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 3, 4, 5, 6, 7, 'gap', 10]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });
});

describe('product JSON-LD', () => {
  it('uses AggregateOffer for several prices and decimal prices', () => {
    const ld = productLd({ product, path: '/product/oxford', lang: 'ar', currency: 'SAR' });
    expect(ld).toMatchObject({
      '@type': 'Product',
      name: 'Oxford <Shirt>',
      url: 'https://shop.example/ar/product/oxford',
      brand: { name: 'Zentra' },
      image: ['https://cdn/1.webp', 'https://cdn/2.webp', 'https://cdn/3.webp'],
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '50.00',
        highPrice: '60.00',
        offerCount: 3,
        priceCurrency: 'SAR',
        availability: 'https://schema.org/InStock',
      },
    });
    expect(ld).not.toHaveProperty('sku');
  });

  it('uses a single Offer with sku; unknown availability is omitted', () => {
    const one = { ...product, variants: [product.variants[1]], priceMax: 5000, inStock: null };
    const ld = productLd({ product: one, path: '/product/oxford', lang: 'en', currency: 'SAR' });
    expect(ld.sku).toBe('SKU-b');
    expect(ld.offers).toEqual({
      '@type': 'Offer',
      url: 'https://shop.example/product/oxford',
      price: '50.00',
      priceCurrency: 'SAR',
      itemCondition: 'https://schema.org/NewCondition',
    });
  });
});
