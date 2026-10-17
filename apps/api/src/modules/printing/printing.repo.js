import { LabelTemplate, PrinterProfile, ReceiptTemplate } from './printer.model.js';

/** The ONLY place touching the printer profile and template models. */
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

// ---------------------------------------------------------------- templates (P6.4)

export async function getReceiptTemplate() {
  const found = await ReceiptTemplate.findOne({ key: 'default' }).lean();
  if (found) return found;
  await ReceiptTemplate.updateOne(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true },
  );
  return ReceiptTemplate.findOne({ key: 'default' }).lean();
}

/** Localized fields need `doc.save()` so the translation hooks run (D-045). */
export async function updateReceiptTemplate(apply) {
  await getReceiptTemplate();
  const doc = await ReceiptTemplate.findOne({ key: 'default' });
  await apply(doc);
  await doc.save();
  return doc.toObject();
}

export async function getLabelTemplate() {
  const found = await LabelTemplate.findOne({ key: 'default' }).lean();
  if (found) return found;
  await LabelTemplate.updateOne(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true },
  );
  return LabelTemplate.findOne({ key: 'default' }).lean();
}

export async function updateLabelTemplate(apply) {
  await getLabelTemplate();
  const doc = await LabelTemplate.findOne({ key: 'default' });
  await apply(doc);
  await doc.save();
  return doc.toObject();
}
