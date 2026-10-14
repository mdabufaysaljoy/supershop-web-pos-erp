import { Page } from './page.model.js';

/** The ONLY place touching the page model. */
const live = { deletedAt: null };

export const findById = (id) => Page.findById(id).lean();
export const findBySlug = (slug) => Page.findOne({ slug, ...live }).lean();
export const findHome = () => Page.findOne({ isHome: true, ...live }).lean();
/** Published pages among these ids — a menu never links to a page a visitor cannot see. */
export const findPublishedByIds = (ids) =>
  Page.find({ _id: { $in: ids }, status: 'published', ...live }, { slug: 1 }).lean();
/** Sitemap: published pages' addresses and last change, in stable order. */
export const listPublishedSlugs = () =>
  Page.find({ status: 'published', ...live }, { slug: 1, publishedAt: 1, updatedAt: 1 })
    .sort({ _id: 1 })
    .lean();
export const slugExists = (slug, exceptId) =>
  Page.exists({ slug, ...live, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
export const list = async ({ skip, limit, status }) => {
  const filter = { ...live, ...(status && { status }) };
  const [items, total] = await Promise.all([
    Page.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Page.countDocuments(filter),
  ]);
  return { items, total };
};

export const create = async (data) => (await Page.create(data)).toObject();

/** Localized fields need `doc.save()` so the translation hooks run (D-045). */
export async function update(id, apply) {
  const doc = await Page.findOne({ _id: id, ...live });
  if (!doc) return null;
  await apply(doc);
  await doc.save();
  return doc.toObject();
}

/** Only one page can be the home page. */
export const clearHome = (exceptId) =>
  Page.updateMany({ isHome: true, _id: { $ne: exceptId } }, { $set: { isHome: false } });

export const softDelete = (id) =>
  Page.findOneAndUpdate(
    { _id: id, ...live },
    { $set: { deletedAt: new Date(), isHome: false } },
    { returnDocument: 'after' },
  ).lean();
