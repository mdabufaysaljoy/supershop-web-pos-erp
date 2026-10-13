import mongoose from 'mongoose';

/**
 * Staff member (admin panel / POS user). Authentication data lives in the auth module;
 * role/permissions and branch scope are managed by RBAC (P0.5).
 */
const { Schema } = mongoose;

const staffSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // Unique even when soft-deleted: deleting a staff member anonymizes the email (P0.5).
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      unique: true,
    },
    phone: { type: String, default: null },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
    branchIds: { type: [Schema.Types.ObjectId], default: [] },
    /** Explicit, audited bypass of permission checks (CLAUDE.md §5.2). */
    isSuperAdmin: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'staff', timestamps: true },
);

export const Staff = mongoose.models.Staff ?? mongoose.model('Staff', staffSchema);
