import { SOURCE_LANGUAGE, walkBlocks } from '@supershop/shared';

/**
 * What a page's blocks need from the rest of the shop (P5.3): the products of a rail, the
 * categories of a grid, the brands of a strip. A renderer never queries anything — it reads
 * `context.data[blockId]` — and this file never imports another module: the composition root
 * injects the lookups, so pages stay independent of catalogue and orders.
 */
let providers = {
  /** @type {null | ((query: object, lang: string) => Promise<{ items: object[] }>)} */
  searchProducts: null,
  /** @type {null | ((ids: string[], lang: string) => Promise<object[]>)} */
  getProductCards: null,
  /** @type {null | ((opts: { limit: number }) => Promise<string[]>)} */
  getBestSellingProductIds: null,
  /** @type {null | ((tag: string, limit: number) => Promise<string[]>)} */
  getProductIdsByTag: null,
  /** @type {null | (() => Promise<object[]>)} */
  listCategories: null,
  /** @type {null | ((ids: string[]) => Promise<object[]>)} */
  getCategoriesByIds: null,
  /** @type {null | ((ids: string[]) => Promise<object[]>)} */
  getBrandsByIds: null,
  /** @type {null | ((limit: number) => Promise<object[]>)} */
  getBrandsWithLogo: null,
};

export function setBlockDataProviders(next) {
  providers = { ...providers, ...next };
}

/** Image as the renderer wants it: one url plus every stored width to choose from (D-094). */
export const rendererImage = (image) =>
  image && {
    url: image.url,
    srcSet: image.sources?.map((s) => `${s.url} ${s.width}w`).join(', ') ?? null,
    width: image.width,
    height: image.height,
  };

const BRAND_STRIP_MAX = 20;

/** Keeps `ids` order (a manual rail is shown in the order the admin arranged). */
const inGivenOrder = (items, ids) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
};

const productView = (card) => ({
  id: card.id,
  href: `/product/${card.slug}`,
  name: card.name,
  price: card.priceMin,
  image: rendererImage(card.image),
});

/** Product ids for a rail, from whichever source the admin chose. */
async function railProducts(props, lang) {
  const limit = props.limit ?? 8;
  const { searchProducts, getProductCards, getBestSellingProductIds, getProductIdsByTag } =
    providers;
  if (props.source === 'manual') {
    const ids = (props.productIds ?? []).slice(0, limit).map(String);
    if (!ids.length || !getProductCards) return [];
    return inGivenOrder(await getProductCards(ids, lang), ids);
  }
  if (props.source === 'bestSelling') {
    if (!getBestSellingProductIds || !getProductCards) return [];
    const ids = await getBestSellingProductIds({ limit });
    return ids.length ? inGivenOrder(await getProductCards(ids, lang), ids) : [];
  }
  if (props.source === 'tag') {
    if (!props.tag || !getProductIdsByTag || !getProductCards) return [];
    const ids = await getProductIdsByTag(props.tag, limit);
    return ids.length ? inGivenOrder(await getProductCards(ids, lang), ids) : [];
  }
  if (!searchProducts) return [];
  const { items } = await searchProducts(
    {
      page: 1,
      limit,
      sort: 'newest',
      ...(props.source === 'category' &&
        props.categoryId && { categoryId: String(props.categoryId) }),
    },
    lang,
  );
  return items;
}

/** The categories of a grid: the chosen ones, or the top level when none were chosen. */
async function gridCategories(props) {
  const ids = (props.categoryIds ?? []).map(String);
  const { getCategoriesByIds, listCategories } = providers;
  if (ids.length) {
    if (!getCategoriesByIds) return [];
    return inGivenOrder(await getCategoriesByIds(ids), ids);
  }
  if (!listCategories) return [];
  const all = await listCategories();
  return all.filter((c) => c.depth === 0).slice(0, 12);
}

async function stripBrands(props) {
  const ids = (props.brandIds ?? []).map(String);
  const { getBrandsByIds, getBrandsWithLogo } = providers;
  if (ids.length) return getBrandsByIds ? inGivenOrder(await getBrandsByIds(ids), ids) : [];
  return getBrandsWithLogo ? getBrandsWithLogo(BRAND_STRIP_MAX) : [];
}

const localizedText = (value, lang) =>
  typeof value === 'string' ? value : (value?.[lang] ?? value?.[SOURCE_LANGUAGE] ?? '');

/**
 * Resolves every data-backed block of a page in parallel.
 * @returns {Promise<Record<string, object>>} blockId → what that block's renderer needs
 */
export async function blockDataFor(blocks, lang = SOURCE_LANGUAGE) {
  const jobs = [];
  for (const block of walkBlocks(blocks)) {
    const props = block.props ?? {};
    if (block.type === 'productRail')
      jobs.push(
        railProducts(props, lang).then((items) => [block.id, { products: items.map(productView) }]),
      );
    else if (block.type === 'categoryGrid')
      jobs.push(
        gridCategories(props).then((items) => [
          block.id,
          {
            categories: items.map((c) => ({
              id: c.id,
              href: `/category/${c.slug}`,
              name: localizedText(c.name, lang),
              image: rendererImage(c.image),
            })),
          },
        ]),
      );
    else if (block.type === 'brandStrip')
      jobs.push(
        stripBrands(props).then((items) => [
          block.id,
          {
            brands: items.map((b) => ({
              id: b.id,
              href: `/search?brands=${b.id}`,
              name: localizedText(b.name, lang),
              logo: rendererImage(b.logo),
            })),
          },
        ]),
      );
  }
  if (!jobs.length) return {};
  return Object.fromEntries(await Promise.all(jobs));
}
