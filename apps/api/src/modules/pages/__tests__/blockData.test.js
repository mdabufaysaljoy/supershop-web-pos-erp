import { describe, expect, it, vi } from 'vitest';
import { blockDataFor, setBlockDataProviders } from '../page.blockData.js';

/**
 * P5.3 — a block says what it wants ("best selling", this category, these products) and the page
 * fills it in. The lookups are injected, so this proves the choosing, the order and the shapes
 * without a database.
 */
const card = (id, name) => ({
  id,
  slug: name.toLowerCase(),
  name,
  priceMin: 1000,
  image: {
    url: `/m/${id}.webp`,
    width: 800,
    height: 600,
    sources: [{ url: `/m/${id}.webp`, width: 800 }],
  },
});

function providers(over = {}) {
  const calls = { search: [], cards: [] };
  setBlockDataProviders({
    searchProducts: vi.fn(async (query) => {
      calls.search.push(query);
      return { items: [card('p1', 'Kettle')] };
    }),
    getProductCards: vi.fn(async (ids) => {
      calls.cards.push(ids);
      // Out of order on purpose: the page must restore what the admin arranged.
      return [...ids].reverse().map((id) => card(id, `Item ${id}`));
    }),
    getBestSellingProductIds: vi.fn(async ({ limit }) => ['b1', 'b2'].slice(0, limit)),
    getProductIdsByTag: vi.fn(async (tag) => (tag === 'sale' ? ['t1'] : [])),
    listCategories: vi.fn(async () => [
      { id: 'c1', slug: 'home', name: { en: 'Home', ar: 'المنزل' }, depth: 0, image: null },
      { id: 'c2', slug: 'kitchen', name: { en: 'Kitchen' }, depth: 1, image: null },
    ]),
    getCategoriesByIds: vi.fn(async (ids) =>
      ids.map((id) => ({ id, slug: id, name: { en: id }, image: null })),
    ),
    getBrandsByIds: vi.fn(async (ids) => ids.map((id) => ({ id, name: id, logo: null }))),
    getBrandsWithLogo: vi.fn(async () => [
      { id: 'b9', name: 'Acme', logo: { url: '/m/l.webp', width: 200, height: 80, sources: [] } },
    ]),
    ...over,
  });
  return calls;
}

const rail = (props) => [{ id: 'blk-rail', type: 'productRail', props }];

describe('block data', () => {
  it('asks the catalogue for the newest products, as many as the block wants', async () => {
    const calls = providers();
    const data = await blockDataFor(rail({ source: 'newest', limit: 4 }), 'en');
    expect(calls.search[0]).toEqual({ page: 1, limit: 4, sort: 'newest' });
    expect(data['blk-rail'].products).toEqual([
      expect.objectContaining({
        id: 'p1',
        href: '/product/kettle',
        name: 'Kettle',
        price: 1000,
        image: expect.objectContaining({ srcSet: '/m/p1.webp 800w' }),
      }),
    ]);
  });

  it('narrows to one category only when that is the chosen source', async () => {
    const calls = providers();
    await blockDataFor(rail({ source: 'category', categoryId: 'c1', limit: 8 }), 'en');
    expect(calls.search[0]).toMatchObject({ categoryId: 'c1' });
    await blockDataFor(rail({ source: 'newest', categoryId: 'c1', limit: 8 }), 'en');
    expect(calls.search[1].categoryId).toBeUndefined();
  });

  it('keeps hand-picked products in the order the admin arranged', async () => {
    providers();
    const data = await blockDataFor(
      rail({ source: 'manual', productIds: ['x1', 'x2', 'x3'], limit: 8 }),
      'en',
    );
    expect(data['blk-rail'].products.map((p) => p.id)).toEqual(['x1', 'x2', 'x3']);
  });

  it('takes only as many hand-picked products as the block shows', async () => {
    const calls = providers();
    await blockDataFor(rail({ source: 'manual', productIds: ['x1', 'x2', 'x3'], limit: 2 }), 'en');
    expect(calls.cards[0]).toEqual(['x1', 'x2']);
  });

  it('reads best sellers and tags from their own sources', async () => {
    const calls = providers();
    const best = await blockDataFor(rail({ source: 'bestSelling', limit: 2 }), 'en');
    expect(best['blk-rail'].products.map((p) => p.id)).toEqual(['b1', 'b2']);
    const tagged = await blockDataFor(rail({ source: 'tag', tag: 'sale', limit: 8 }), 'en');
    expect(tagged['blk-rail'].products.map((p) => p.id)).toEqual(['t1']);
    expect(calls.search).toHaveLength(0);
  });

  it('leaves a rail empty rather than guessing when its source is incomplete', async () => {
    providers();
    expect(await blockDataFor(rail({ source: 'tag', tag: '', limit: 8 }), 'en')).toEqual({
      'blk-rail': { products: [] },
    });
    expect(await blockDataFor(rail({ source: 'manual', productIds: [], limit: 8 }), 'en')).toEqual({
      'blk-rail': { products: [] },
    });
  });

  it('shows the main categories when the admin picked none, in the visitor’s language', async () => {
    providers();
    const data = await blockDataFor([{ id: 'blk-grid', type: 'categoryGrid', props: {} }], 'ar');
    expect(data['blk-grid'].categories).toEqual([
      { id: 'c1', href: '/category/home', name: 'المنزل', image: null },
    ]);
  });

  it('keeps chosen categories in the admin’s order', async () => {
    providers();
    const data = await blockDataFor(
      [{ id: 'blk-grid', type: 'categoryGrid', props: { categoryIds: ['c2', 'c1'] } }],
      'en',
    );
    expect(data['blk-grid'].categories.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('falls back to every brand with a logo, linked to its listing', async () => {
    providers();
    const data = await blockDataFor([{ id: 'blk-b', type: 'brandStrip', props: {} }], 'en');
    expect(data['blk-b'].brands).toEqual([
      {
        id: 'b9',
        href: '/search?brands=b9',
        name: 'Acme',
        logo: expect.objectContaining({ url: '/m/l.webp' }),
      },
    ]);
  });

  it('resolves blocks nested inside a container too, and ignores plain ones', async () => {
    providers();
    const data = await blockDataFor(
      [
        { id: 'blk-head', type: 'heading', props: { text: 'Hi' } },
        {
          id: 'blk-col',
          type: 'columns',
          props: { gap: 'md' },
          blocks: [{ id: 'blk-rail', type: 'productRail', props: { source: 'newest', limit: 2 } }],
        },
      ],
      'en',
    );
    expect(Object.keys(data)).toEqual(['blk-rail']);
  });

  it('stays quiet when a lookup was never injected', async () => {
    setBlockDataProviders({ searchProducts: null });
    const data = await blockDataFor(rail({ source: 'newest', limit: 2 }), 'en');
    expect(data).toEqual({ 'blk-rail': { products: [] } });
  });
});
