import { Staff } from './staff.model.js';

const notDeleted = { deletedAt: null };

export const findStaffByEmail = (email) => Staff.findOne({ email, ...notDeleted }).lean();
export const findStaffById = (id) => Staff.findOne({ _id: id, ...notDeleted }).lean();
export const createStaff = (data, { session } = {}) =>
  Staff.create([data], { session }).then(([doc]) => doc.toObject());
