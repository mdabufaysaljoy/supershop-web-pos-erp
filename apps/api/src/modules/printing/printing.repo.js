import { PrinterProfile } from './printer.model.js';

/** The ONLY place touching the printer profile model. */
export const list = (filter = {}) => PrinterProfile.find(filter).sort({ name: 1 }).lean();
export const findById = (id) => PrinterProfile.findById(id).lean();
export const create = async (data) => (await PrinterProfile.create(data)).toObject();
export const update = (id, patch) =>
  PrinterProfile.findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after' }).lean();
export const remove = (id) => PrinterProfile.findByIdAndDelete(id).lean();

/** Only one default per kind and branch — the till must never have to choose for itself. */
export const clearDefault = (kind, branchId, exceptId) =>
  PrinterProfile.updateMany(
    {
      kind,
      branchId: branchId ?? null,
      isDefault: true,
      ...(exceptId && { _id: { $ne: exceptId } }),
    },
    { $set: { isDefault: false } },
  );

/** The default for this branch, or the shop-wide one, or whatever there is. */
export async function findDefault(kind, branchId) {
  const candidates = await PrinterProfile.find({
    kind,
    $or: [{ branchId: branchId ?? null }, { branchId: null }],
  })
    .sort({ isDefault: -1, branchId: -1, name: 1 })
    .lean();
  return candidates[0] ?? null;
}
