import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

const { ObjectId } = mongoose.Schema.Types;
const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

/**
 * Category tree (CLAUDE.md §4: parentId + path). `ancestors` is the materialized path (root → parent)
 * so a whole subtree is one indexed query (`{ ancestors: id }`); `position` orders siblings.
 * Text fields are LocalizedStrings (English source, auto-translated). Soft-deleted.
 */
const categorySchema = new mongoose.Schema(
  {
    name: localizedField(),
    description: localizedField(),
    /** URL slug (English, `[a-z0-9-]`), unique among non-deleted categories. */
    slug: { type: String, required: true },
    parentId: { type: ObjectId, default: null },
    ancestors: { type: [ObjectId], default: [] },
    depth: { type: Number, default: 0 },
    position: { type: Number, default: 0 },
    /** Media library item (P1.1). */
    imageId: { type: ObjectId, default: null },
    /** Hidden from the storefront when false (and so is its whole subtree). */
    isActive: { type: Boolean, default: true },
    seo: { title: localizedField(), description: localizedField() },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'categories', timestamps: true },
);
categorySchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
categorySchema.index({ parentId: 1, position: 1 });
categorySchema.index({ ancestors: 1 });
categorySchema.plugin(localized, {
  fields: ['name', 'description', 'seo.title', 'seo.description'],
});

export const Category = mongoose.models.Category ?? mongoose.model('Category', categorySchema);
