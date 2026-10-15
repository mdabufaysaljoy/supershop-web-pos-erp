import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * A menu (P5.4): an arranged tree of items that POINT at pages, categories, brands or addresses.
 * `title` is for the shop's own eyes (which menu is which); the customer-facing LABELS live in
 * the items and are mirrored into `texts`, keyed by item id, so the ordinary translation
 * machinery handles them (D-134).
 */
const menuSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true },
    location: { type: String, enum: ['header', 'footer'], default: 'footer' },
    /** `[{ id, label, target, ref, href, children: [...] }]` — validated by the shared schema. */
    items: { type: [Mixed], default: [] },
    texts: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true },
            value: { type: LocalizedString, default: () => ({}) },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    updatedBy: { type: ObjectId, default: null },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'menus', timestamps: true, minimize: false },
);

menuSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
menuSchema.index({ location: 1 });
menuSchema.plugin(localized, { fields: ['texts.*.value'] });

export const Menu = mongoose.models.Menu ?? mongoose.model('Menu', menuSchema);
