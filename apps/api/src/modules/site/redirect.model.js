import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * A redirect (P5.5): "this address moved there", or "it is gone" (410). `from` is the
 * LANGUAGE-NEUTRAL path, normalized on the way in, so one rule serves every language.
 *
 * `hits` is counted by the storefront asking for the list, not per visitor — it is here so an
 * admin can see which rules still matter, not as analytics.
 */
const redirectSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, default: '' },
    status: { type: Number, enum: [301, 302, 410], default: 301 },
    note: { type: String, default: '' },
    createdBy: { type: ObjectId, default: null },
  },
  { collection: 'redirects', timestamps: true },
);

redirectSchema.index({ from: 1 }, { unique: true });

export const Redirect = mongoose.models.Redirect ?? mongoose.model('Redirect', redirectSchema);
