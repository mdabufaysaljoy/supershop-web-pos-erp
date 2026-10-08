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
