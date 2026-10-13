import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

const localizedField = () => ({ type: LocalizedString, default: () => ({}) });
const UNIQUE_ACTIVE = { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } };

/**
 * Brand. `name` is a proper noun (never translated); description + SEO are auto-translated.
 * Soft-deleted; name and slug are unique among non-deleted brands.
 */
const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    /** Lower-cased name for case-insensitive uniqueness. */
    nameKey: { type: String, required: true },
    slug: { type: String, required: true },
    description: localizedField(),
    logoId: { type: mongoose.Schema.Types.ObjectId, default: null },
    website: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    /** Keep the name untranslated everywhere via the glossary (see i18n subscriber). */
    protectName: { type: Boolean, default: true },
    seo: { title: localizedField(), description: localizedField() },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'brands', timestamps: true },
);
brandSchema.index({ nameKey: 1 }, UNIQUE_ACTIVE);
brandSchema.index({ slug: 1 }, UNIQUE_ACTIVE);
brandSchema.plugin(localized, { fields: ['description', 'seo.title', 'seo.description'] });

export const Brand = mongoose.models.Brand ?? mongoose.model('Brand', brandSchema);
