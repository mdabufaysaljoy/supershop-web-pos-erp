import { Supplier } from './supplier.model.js';

const ACTIVE = { deletedAt: null };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const nameKeyOf = (name) => name.trim().toLowerCase();

export const findActiveById = (id) => Supplier.findOne({ _id: id, ...ACTIVE }).lean();
export const findActiveByIds = (ids) => Supplier.find({ _id: { $in: ids }, ...ACTIVE }).lean();
export const nameExists = async (name, excludeId) =>
  Boolean(
    await Supplier.exists({
      nameKey: nameKeyOf(name),
      ...ACTIVE,
      ...(excludeId && { _id: { $ne: excludeId } }),
    }),
  );

/** Search covers name, contact, email, phone digits and tax number. */
export async function listActive({ page, limit, sort, q }) {
  const filter = { ...ACTIVE };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { name: rx },
      { contactName: rx },
      { email: rx },
      { phone: rx },
      { taxNumber: rx },
    ];
  }
  const sortField = sort.field === 'name' ? 'nameKey' : sort.field;
  const [items, total] = await Promise.all([
    Supplier.find(filter)
      .sort({ [sortField]: sort.direction, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Supplier.countDocuments(filter),
  ]);
  return { items, total };
}

export const createSupplier = (data) =>
  Supplier.create({ ...data, nameKey: nameKeyOf(data.name) }).then((d) => d.toObject());

export const updateSupplier = (id, patch) =>
  Supplier.findOneAndUpdate(
    { _id: id, ...ACTIVE },
    { $set: { ...patch, ...(patch.name && { nameKey: nameKeyOf(patch.name) }) } },
    { returnDocument: 'after', lean: true, runValidators: true },
  );

export const softDelete = (id) =>
  Supplier.findOneAndUpdate(
    { _id: id, ...ACTIVE },
    { $set: { deletedAt: new Date() } },
    { returnDocument: 'after', lean: true },
  );

/** Every active supplier (id/name only) — lookups for imports. */
export const listAllActive = () =>
  Supplier.find(ACTIVE, { name: 1, nameKey: 1 }).sort({ nameKey: 1 }).lean();
