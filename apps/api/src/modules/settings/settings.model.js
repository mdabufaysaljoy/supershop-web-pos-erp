import mongoose from 'mongoose';

/**
 * Stored setting OVERRIDES only — a key without a document uses its registry default.
 * Secrets are stored in `encryptedValue` (AES-256-GCM, bound to the key), never in `value`.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    encryptedValue: { type: String, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { collection: 'settings', timestamps: true, minimize: false },
);

export const Setting = mongoose.models.Setting ?? mongoose.model('Setting', settingSchema);
