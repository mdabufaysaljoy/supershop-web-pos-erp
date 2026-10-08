import { Role } from './role.model.js';

export const nameKeyOf = (name) => name.trim().toLowerCase();

export const listRoles = () => Role.find().sort({ name: 1 }).lean();
export const findRoleById = (id) => Role.findById(id).lean();
export const findRolesByIds = (ids) => Role.find({ _id: { $in: ids } }).lean();
export const findRoleBySystemKey = (systemKey) => Role.findOne({ systemKey }).lean();
export const findRoleByNameKey = (nameKey) => Role.findOne({ nameKey }).lean();

export const createRole = (data) =>
  Role.create({ ...data, nameKey: nameKeyOf(data.name) }).then((d) => d.toObject());

export const updateRole = (id, patch) =>
  Role.findByIdAndUpdate(
    id,
    { $set: { ...patch, ...(patch.name ? { nameKey: nameKeyOf(patch.name) } : {}) } },
    { returnDocument: 'after', lean: true, runValidators: true },
  );

export const deleteRole = (id) => Role.deleteOne({ _id: id });

/** Inserts the role only if its systemKey does not exist yet (idempotent seeding). */
export const insertSystemRoleIfMissing = (role) =>
  Role.updateOne(
    { systemKey: role.systemKey },
    { $setOnInsert: { ...role, nameKey: nameKeyOf(role.name), isSystem: true } },
    { upsert: true },
  );
