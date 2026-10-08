import mongoose from 'mongoose';
import { Staff } from './staff.model.js';

const notDeleted = { deletedAt: null };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const findStaffByEmail = (email) => Staff.findOne({ email, ...notDeleted }).lean();
export const findStaffById = (id) => Staff.findOne({ _id: id, ...notDeleted }).lean();

export const createStaff = (data, { session } = {}) =>
  Staff.create([data], { session }).then(([doc]) => doc.toObject());

export const updateStaff = (id, patch, { session } = {}) =>
  Staff.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: patch },
    { returnDocument: 'after', lean: true, session },
  );

export const countStaffWithRole = (roleId) => Staff.countDocuments({ roleId, ...notDeleted });

export const countActiveSuperAdmins = ({ session } = {}) =>
  Staff.countDocuments({ isSuperAdmin: true, status: 'active', ...notDeleted }).session(
    session ?? null,
  );

export const findAnySuperAdmin = () => Staff.findOne({ isSuperAdmin: true, ...notDeleted }).lean();

/**
 * Paginated list. `scopeBranchIds` (null = all) limits results to staff sharing at least one branch
 * with the actor; super-admins are hidden from scoped actors.
 */
export async function listStaff({
  page,
  limit,
  sort,
  q,
  status,
  roleId,
  scopeBranchIds,
  branchId,
}) {
  const filter = { ...notDeleted };
  if (status) filter.status = status;
  if (roleId) filter.roleId = roleId;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const and = [];
  if (scopeBranchIds) {
    and.push({ branchIds: { $in: scopeBranchIds.map((id) => new mongoose.Types.ObjectId(id)) } });
    filter.isSuperAdmin = false;
  }
  if (branchId) and.push({ branchIds: new mongoose.Types.ObjectId(branchId) });
  if (and.length) filter.$and = and;
  const [items, total] = await Promise.all([
    Staff.find(filter)
      .sort({ [sort.field]: sort.direction, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Staff.countDocuments(filter),
  ]);
  return { items, total };
}

/** `{ branchId: count }` of (non-deleted) staff assigned per branch. */
export async function countStaffPerBranch() {
  const rows = await Staff.aggregate([
    { $match: notDeleted },
    { $unwind: '$branchIds' },
    { $group: { _id: '$branchIds', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}
export const countStaffInBranch = (branchId) =>
  Staff.countDocuments({ branchIds: branchId, ...notDeleted });
