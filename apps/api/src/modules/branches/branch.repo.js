import { Branch } from './branch.model.js';

const ACTIVE = { deletedAt: null };

/** @param {string[] | null} scope ids the actor may see (null = all) */
export const listBranches = (scope) =>
  Branch.find({ ...ACTIVE, ...(scope && { _id: { $in: scope } }) })
    .sort({ code: 1 })
    .lean();
export const findActiveById = (id) => Branch.findOne({ _id: id, ...ACTIVE }).lean();
export const findActiveByIds = (ids) =>
  Branch.find({ _id: { $in: ids }, ...ACTIVE }, { _id: 1 }).lean();
export const codeExists = async (code, excludeId) =>
  Boolean(await Branch.exists({ code, ...ACTIVE, ...(excludeId && { _id: { $ne: excludeId } }) }));
export const countActive = () => Branch.countDocuments(ACTIVE);
export const listPublic = () =>
  Branch.find({ ...ACTIVE, isActive: true, type: 'store' })
    .sort({ code: 1 })
    .lean();
/** `save()` so the localized plugin schedules translation of the name. */
export const createBranch = (data) => new Branch(data).save().then((d) => d.toObject());
export const loadForUpdate = (id) => Branch.findOne({ _id: id, ...ACTIVE });
export const saveDoc = (doc) => doc.save().then((d) => d.toObject());
export const softDelete = (id) =>
  Branch.findOneAndUpdate(
    { _id: id, ...ACTIVE },
    { $set: { deletedAt: new Date(), isActive: false } },
    { returnDocument: 'after', lean: true },
  );
