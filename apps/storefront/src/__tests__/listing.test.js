import { describe, expect, it } from 'vitest';
import { flattenTree, findCategory, primaryTrail } from '@/lib/categories';
import { hasEmptyParams, isRefined, listingHref, parseListing, toSearchQuery } from '@/lib/listing';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

describe('parseListing', () => {
  it('reads valid params and drops anything invalid', () => {
    expect(
      parseListing({
        q: '  <b>shirt</b> ',
        sort: 'price_asc',
        brands: `${B},nope,${A},${A}`,
        min: '200',
        max: '50',
        page: '3',
      }),
    ).toEqual({
      q: 'bshirt/b',
      sort: 'price_asc',
      brands: [A, B],
      min: 50,
      max: 200,
      page: 3,
      category: null,
    });
    expect(
      parseListing({ sort: 'evil', page: '-1', min: '1.5', max: '1e9', category: 'x' }),
    ).toEqual({
      q: '',
      sort: null,
      brands: [],
      min: null,
      max: null,
      page: 1,
      category: null,
    });
    expect(parseListing({ page: '9999' }).page).toBe(1);
    expect(parseListing({ brands: [B, A] }).brands).toEqual([A, B]); // repeated form fields
  });
});

describe('listing URLs and API queries', () => {
  const l = parseListing({ sort: 'newest', brands: A, page: '2', min: '10' });

  it('keeps one URL per state and resets the page on filter changes', () => {
    expect(listingHref('/ar/category/phones', l)).toBe(
      `/ar/category/phones?brands=${A}&min=10&sort=newest`,
    );
    expect(listingHref('/category/phones', l, { page: 3 })).toBe(
      `/category/phones?brands=${A}&min=10&sort=newest&page=3`,
    );
    expect(listingHref('/search', parseListing({}))).toBe('/search');
    expect(listingHref('/search', parseListing({}), { q: 'tea' })).toBe('/search?q=tea');
  });

  it('converts SAR to halalas for the API', () => {
    expect(toSearchQuery(l, { categoryId: B })).toEqual({
      sort: 'newest',
      brands: A,
      minPrice: 1000,
      page: 2,
      limit: 24,
      categoryId: B,
    });
  });

  it('detects empty form fields (redirected to the clean URL)', () => {
    expect(hasEmptyParams({ min: '150', max: '' })).toBe(true);
    expect(hasEmptyParams({ brands: [A, ''] })).toBe(true);
    expect(hasEmptyParams({ min: '150' })).toBe(false);
    expect(listingHref('/search', parseListing({ min: '150', max: '' }))).toBe('/search?min=150');
  });

  it('knows when a listing is refined', () => {
    expect(isRefined(parseListing({ page: '4' }))).toBe(false);
    expect(isRefined(l)).toBe(true);
  });
});

describe('category tree', () => {
  const tree = [
    {
      id: '1',
      slug: 'fashion',
      children: [{ id: '2', slug: 'men', children: [{ id: '3', slug: 'shirts', children: [] }] }],
    },
    { id: '4', slug: 'grocery', children: [] },
  ];

  it('finds nodes with their trail', () => {
    expect(flattenTree(tree).map((x) => x.node.slug)).toEqual([
      'fashion',
      'men',
      'shirts',
      'grocery',
    ]);
    expect(findCategory(tree, { slug: 'shirts' }).trail.map((n) => n.id)).toEqual(['1', '2', '3']);
    expect(findCategory(tree, { slug: 'nope' })).toBeNull();
  });

  it('uses the deepest category for product breadcrumbs', () => {
    expect(primaryTrail(tree, ['4', '3']).map((n) => n.slug)).toEqual(['fashion', 'men', 'shirts']);
    expect(primaryTrail(tree, ['missing'])).toEqual([]);
  });
});
