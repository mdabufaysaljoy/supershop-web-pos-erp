import { Shift, ZReport } from './shift.model.js';

/** The ONLY place that touches the Shift and ZReport models. */

export const initCollections = () => Promise.all([Shift.init(), ZReport.init()]);

export const insertShift = (data, session) =>
  Shift.create([data], { session }).then(([d]) => d.toObject());

export const findById = (id, session) =>
  Shift.findById(id, null, session ? { session } : {}).lean();

export const findOpenByStaff = (staffId, branchId) =>
  Shift.findOne({
    openedBy: staffId,
    status: 'open',
    ...(branchId ? { branchId } : {}),
  })
    .sort({ openedAt: -1 })
    .lean();

export const findOpenInBranch = (branchId) =>
  Shift.findOne({ branchId, status: 'open' }).sort({ openedAt: -1 }).lean();

export const appendMovement = (id, movement) =>
  Shift.findOneAndUpdate(
    { _id: id, status: 'open' },
    { $push: { movements: movement } },
    { returnDocument: 'after' },
  ).lean();

export const closeShiftDoc = (id, patch, session) =>
  Shift.findOneAndUpdate(
    { _id: id, status: 'open' },
    { $set: { status: 'closed', ...patch } },
    { returnDocument: 'after', session },
  ).lean();

export const insertZReport = (data, session) =>
  ZReport.create([data], { session }).then(([d]) => d.toObject());

export const findZReportByShiftId = (shiftId) => ZReport.findOne({ shiftId }).lean();

export async function listShifts(filter, { sort, skip, limit }) {
  const [items, total] = await Promise.all([
    Shift.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Shift.countDocuments(filter),
  ]);
  return { items, total };
}

export const countInBranch = (branchId) => Shift.countDocuments({ branchId });
