import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

/**
 * Media = one uploaded image, re-encoded into several sizes (variants). Only storage KEYS are
 * stored; public URLs come from the storage adapter at read time (CDN/S3 move = no migration).
 * Soft-deleted (`deletedAt`): files stay so anything already referencing them keeps working.
 */
const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // thumb | md | lg | full
    key: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    bytes: { type: Number, required: true },
  },
  { _id: false },
);

const mediaSchema = new mongoose.Schema(
  {
    /** Display name (sanitized client file name); never used for storage paths. */
    name: { type: String, required: true, maxlength: 200 },
    /** Alt text (SEO + accessibility); auto-translated like all content. */
    alt: { type: LocalizedString, default: () => ({}) },
    mime: { type: String, required: true },
    /** Format detected from the uploaded bytes (jpeg, png, webp, gif, avif). */
    sourceFormat: { type: String, required: true },
    animated: { type: Boolean, default: false },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    /** Size of the stored full variant. */
    bytes: { type: Number, required: true },
    originalBytes: { type: Number, required: true },
    /** SHA-256 of the uploaded bytes — re-uploading the same file returns the existing item. */
    sha256: { type: String, required: true },
    variants: { type: [variantSchema], default: [] },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'media', timestamps: true },
);
mediaSchema.index({ deletedAt: 1, createdAt: -1 });
mediaSchema.index({ sha256: 1 });
mediaSchema.plugin(localized, { fields: ['alt'] });

export const Media = mongoose.models.Media ?? mongoose.model('Media', mediaSchema);
