import mongoose from 'mongoose';

/**
 * Role = named set of permission keys (+ branch reach). Roles are DATA (CLAUDE.md §2.4):
 * admins create/edit them; the permission registry in @supershop/shared defines valid keys.
 */
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    /** Lower-cased name for case-insensitive uniqueness. */
    nameKey: { type: String, required: true, unique: true },
    description: { type: String, default: '', maxlength: 200 },
    permissions: { type: [String], default: [] },
    allBranches: { type: Boolean, default: false },
    /** Stable key for seeded roles (e.g. 'cashier'); system roles can be edited but not deleted. */
    systemKey: { type: String, default: null },
    isSystem: { type: Boolean, default: false },
  },
  { collection: 'roles', timestamps: true },
);
roleSchema.index(
  { systemKey: 1 },
  { unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } },
);

export const Role = mongoose.models.Role ?? mongoose.model('Role', roleSchema);
