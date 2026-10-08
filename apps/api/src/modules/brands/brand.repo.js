import { Brand } from './brand.model.js';

const ACTIVE = { deletedAt: null };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const nameKeyOf = (name) => name.trim().toLowerCase();

export const findActiveById = (id) => Brand.findOne({ _id: id, ...ACTIVE }).lean();
export const findActiveByIds = (ids) => Brand.find({ _id: { $in: ids }, ...ACTIVE }).lean();
const existsWhere = async (filter, excludeId) =>
  Boolean(
    await Brand.exists({ ...filter, ...ACTIVE, ...(excludeId && { _id: { $ne: excludeId } }) }),
  );
export const slugExists = (slug, excludeId) => existsWhere({ slug }, excludeId);
export const nameExists = (name, excludeId) => existsWhere({ nameKey: nameKeyOf(name) }, excludeId);

/** @param {{ page: number, limit: number, sort: { field: string, direction: 1 | -1 }, q?: string }} query */
export async function listActive({ page, limit, sort, q }) {
  const filter = { ...ACTIVE, ...(q && { name: new RegExp(escapeRegex(q), 'i') }) };
  const sortField = sort.field === 'name' ? 'nameKey' : sort.field;
  const [items, total] = await Promise.all([
    Brand.find(filter)
      .sort({ [sortField]: sort.direction, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Brand.countDocuments(filter),
  ]);
  return { items, total };
}

/** Storefront: visible brands A–Z. */
export const listVisible = () =>
  Brand.find({ ...ACTIVE, isActive: true })
    .sort({ nameKey: 1 })
    .lean();

export const createBrand = (data) =>
  new Brand({ ...data, nameKey: nameKeyOf(data.name) }).save().then((d) => d.toObject());
export const loadForUpdate = (id) => Brand.findOne({ _id: id, ...ACTIVE });
export const saveDoc = (doc) => {
  doc.nameKey = nameKeyOf(doc.name);
  return doc.save().then((d) => d.toObject());
};
export const softDelete = (id) =>
  Brand.findOneAndUpdate(
    { _id: id, ...ACTIVE },
    { $set: { deletedAt: new Date() } },
    { returnDocument: 'after', lean: true },
  );
