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
/** Deleted included: history (stock ledger, orders) keeps showing the branch. */
export const findByIds = (ids) =>
  Branch.find({ _id: { $in: ids } }, { code: 1, name: 1, deletedAt: 1 }).lean();
/** Ids of branches whose stock serves online orders (active, not deleted). */
export const findOnlineBranchIds = () =>
  Branch.distinct('_id', { ...ACTIVE, isActive: true, fulfillsOnlineOrders: true });
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
