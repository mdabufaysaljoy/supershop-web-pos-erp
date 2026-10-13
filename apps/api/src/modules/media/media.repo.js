import { Media } from './media.model.js';

const ACTIVE = { deletedAt: null };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORT_FIELDS = { createdAt: 'createdAt', bytes: 'bytes', name: 'name' };

export const findActiveById = (id) => Media.findOne({ _id: id, ...ACTIVE }).lean();
export const findActiveByIds = (ids) => Media.find({ _id: { $in: ids }, ...ACTIVE }).lean();
export const findActiveBySha = (sha256) => Media.findOne({ sha256, ...ACTIVE }).lean();

/** @param {{ page: number, limit: number, sort: { field: string, direction: 1 | -1 }, q?: string }} query */
export async function listActive({ page, limit, sort, q }) {
  const filter = { ...ACTIVE };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { 'alt.en': rx }];
  }
  const [items, total] = await Promise.all([
    Media.find(filter)
      .sort({ [SORT_FIELDS[sort.field]]: sort.direction, _id: sort.direction })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Media.countDocuments(filter),
  ]);
  return { items, total };
}

/** Uses `save()` so the localized plugin schedules alt-text translation. */
export const createMedia = (data) => new Media(data).save().then((d) => d.toObject());

/** Loads the document for an edit; `save()` runs the localized hooks. Null if missing/deleted. */
export const loadForUpdate = (id) => Media.findOne({ _id: id, ...ACTIVE });
export const saveDoc = (doc) => doc.save().then((d) => d.toObject());

export const softDelete = (id) =>
  Media.findOneAndUpdate(
    { _id: id, ...ACTIVE },
    { $set: { deletedAt: new Date() } },
    { returnDocument: 'after', lean: true },
  );
