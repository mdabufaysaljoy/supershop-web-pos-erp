import { Product, Variant } from './product.model.js';

const ACTIVE = { deletedAt: null };
const opts = (session) => (session ? { session } : {});
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORT_FIELDS = {
  updatedAt: 'updatedAt',
  createdAt: 'createdAt',
  name: 'name.en',
  priceMin: 'priceMin',
};

// ---------- products ----------
export const findActiveProduct = (id, session) =>
  Product.findOne({ _id: id, ...ACTIVE }, null, opts(session)).lean();
export const findActiveBySlug = (slug) => Product.findOne({ slug, ...ACTIVE }).lean();
export const findPublicBySlug = (slug) =>
  Product.findOne({ slug, status: 'active', ...ACTIVE }).lean();
export const loadProductForUpdate = (id, session) =>
  Product.findOne({ _id: id, ...ACTIVE }, null, opts(session));
export const slugExists = async (slug, excludeId) =>
  Boolean(await Product.exists({ slug, ...ACTIVE, ...(excludeId && { _id: { $ne: excludeId } }) }));

/** `save()` so the localized plugin marks/schedules translation. */
export const saveProduct = (doc, session) => doc.save(opts(session)).then((d) => d.toObject());
export const newProduct = (data) => new Product(data);

/**
 * @param {{ page: number, limit: number, sort: { field: string, direction: 1 | -1 }, q?: string,
 *   status?: string, categoryId?: string, brandId?: string, supplierId?: string }} query
 */
export async function listProducts({
  page,
  limit,
  sort,
  q,
  status,
  categoryId,
  brandId,
  supplierId,
}) {
  const filter = { ...ACTIVE };
  if (status) filter.status = status;
  if (categoryId) filter.categoryIds = categoryId;
  if (brandId) filter.brandId = brandId;
  if (supplierId) filter.supplierId = supplierId;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const bySku = await Variant.distinct('productId', {
      ...ACTIVE,
      $or: [{ sku: rx }, { barcode: rx }],
    });
    filter.$or = [{ 'name.en': rx }, { slug: rx }, { _id: { $in: bySku } }];
  }
  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort({ [SORT_FIELDS[sort.field]]: sort.direction, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { items, total };
}

export const softDeleteProduct = async (id, session) => {
  const now = new Date();
  const res = await Product.updateOne(
    { _id: id, ...ACTIVE },
    { $set: { deletedAt: now } },
    opts(session),
  );
  await Variant.updateMany(
    { productId: id, ...ACTIVE },
    { $set: { deletedAt: now } },
    opts(session),
  );
  return res.modifiedCount > 0;
};

export const countActiveProducts = (filter, session) =>
  Product.countDocuments({ ...filter, ...ACTIVE }, opts(session));

// ---------- variants ----------
export const listVariants = (productId, session) =>
  Variant.find({ productId, ...ACTIVE }, null, opts(session))
    .sort({ position: 1, _id: 1 })
    .lean();

export const listVariantsByProductIds = (productIds, session) =>
  productIds.length
    ? Variant.find({ productId: { $in: productIds }, ...ACTIVE }, null, opts(session))
        .sort({ position: 1, _id: 1 })
        .lean()
    : [];

/** Active variants of OTHER products using any of these SKUs/barcodes. */
export const findCodeConflicts = ({ productId, skus, barcodes }) =>
  Variant.find(
    {
      ...ACTIVE,
      ...(productId && { productId: { $ne: productId } }),
      $or: [{ sku: { $in: skus } }, ...(barcodes.length ? [{ barcode: { $in: barcodes } }] : [])],
    },
    { sku: 1, barcode: 1 },
  ).lean();

export const insertVariants = (docs, session) =>
  docs.length ? Variant.create(docs, { ...opts(session), ordered: true }) : [];
export const updateVariant = (id, set, session) =>
  Variant.updateOne({ _id: id, ...ACTIVE }, { $set: set }, opts(session));
export const softDeleteVariants = (ids, session) =>
  ids.length
    ? Variant.updateMany(
        { _id: { $in: ids }, ...ACTIVE },
        { $set: { deletedAt: new Date() } },
        opts(session),
      )
    : null;

/** Which of these barcodes are already used by an active variant. */
export const existingBarcodes = async (codes) =>
  new Set(await Variant.distinct('barcode', { barcode: { $in: codes }, ...ACTIVE }));

/** Active variant by exact barcode, else by exact SKU. */
export const findVariantByCode = async (code) =>
  (await Variant.findOne({ barcode: code, ...ACTIVE }).lean()) ??
  (await Variant.findOne({ sku: code, ...ACTIVE }).lean());

/** Active products carrying a tag, newest first — the "by tag" product rail (P5.3). */
export const findIdsByTag = (tag, limit) =>
  Product.find({ ...ACTIVE, status: 'active', tags: tag }, { _id: 1 })
    .sort({ createdAt: -1, _id: 1 })
    .limit(limit)
    .lean();

/** Sitemap: active products' slugs and last change, in stable order. */
export const listPublicSlugs = (skip, limit) =>
  Product.find({ ...ACTIVE, status: 'active' }, { slug: 1, updatedAt: 1 })
    .sort({ _id: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

// ---------- inventory lookups ----------
/** Variants by id, deleted included (the stock ledger keeps referring to them). */
export const findVariantsByIds = (ids) => Variant.find({ _id: { $in: ids } }).lean();
export const findProductsByIds = (ids) =>
  Product.find(
    { _id: { $in: ids } },
    { name: 1, slug: 1, options: 1, status: 1, deletedAt: 1 },
  ).lean();

/**
 * Ids of active variants matching a staff search: SKU prefix, exact barcode, or product name
 * (English or Arabic) containing the text. Bounded (`limit`).
 */
export async function matchVariantIds(q, limit = 1000) {
  const code = q.trim().toUpperCase();
  const rx = new RegExp(escapeRegex(q.trim()), 'i');
  const productIds = await Product.distinct('_id', {
    ...ACTIVE,
    $or: [{ 'name.en': rx }, { 'name.ar': rx }],
  });
  const variants = await Variant.find(
    {
      ...ACTIVE,
      $or: [
        { sku: { $regex: `^${escapeRegex(code)}` } },
        { barcode: code },
        { productId: { $in: productIds.slice(0, limit) } },
      ],
    },
    { _id: 1 },
  )
    .limit(limit)
    .lean();
  return variants.map((v) => v._id);
}

export const findVariantCosts = (ids, session) =>
  Variant.find({ _id: { $in: ids } }, { cost: 1, productId: 1 }, opts(session)).lean();
export const setVariantCost = (id, cost, session) =>
  Variant.updateOne({ _id: id }, { $set: { cost } }, opts(session));

/** Raw products (deleted included, so the index can drop them) for search indexing. */
export const findForIndex = (ids) => Product.find({ _id: { $in: ids } }).lean();
export const activeVariantsOf = (productIds) =>
  Variant.find(
    { productId: { $in: productIds }, ...ACTIVE },
    {
      productId: 1,
      sku: 1,
      barcode: 1,
      price: 1,
      compareAtPrice: 1,
      isActive: 1,
      optionValues: 1,
      imageIds: 1,
      position: 1,
    },
  ).lean();
/** Active product ids in batches (cursor) — optionally limited to a category or brand. */
export async function* activeProductIds({ categoryId, brandId } = {}, batch = 500) {
  const filter = {
    ...ACTIVE,
    ...(categoryId && { categoryIds: categoryId }),
    ...(brandId && { brandId }),
  };
  let ids = [];
  for await (const p of Product.find(filter, { _id: 1 }).lean().cursor()) {
    ids.push(String(p._id));
    if (ids.length === batch) {
      yield ids;
      ids = [];
    }
  }
  if (ids.length) yield ids;
}
