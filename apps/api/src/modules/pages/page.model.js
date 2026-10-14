import mongoose from 'mongoose';
import { PAGE_SCHEMA_VERSION } from '@supershop/shared';
import { localized, LocalizedString } from '../i18n/index.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;
const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

/**
 * A CMS page (P5.1): a versioned block document plus the customer-facing TEXT of those blocks,
 * held in a flat array so the ordinary translation machinery works on it with no special cases
 * (§5.7). `content` keeps the English source, so a page renders before any translation exists.
 *
 * `draft` is what the builder edits; `published` is what visitors see. P5.2 adds versions/autosave
 * on top of this shape, P5.4 the CRUD screens.
 */
const contentSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, default: PAGE_SCHEMA_VERSION },
    blocks: { type: [Mixed], default: [] },
  },
  { _id: false, minimize: false },
);

const pageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    title: localizedField(),
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    /** Only one page may be the home page; others are reached by their slug. */
    isHome: { type: Boolean, default: false },
    draft: { type: contentSchema, default: () => ({}) },
    published: { type: contentSchema, default: null },
    /**
     * `[{ key: '<blockId>.<prop>', value: LocalizedString }]` — the page's text, from the DRAFT
     * (what is being written is what gets translated; publishing copies the blocks, not the text).
     */
    texts: {
      type: [
        new mongoose.Schema(
          { key: { type: String, required: true }, value: localizedField() },
          { _id: false },
        ),
      ],
      default: [],
    },
    seo: { title: localizedField(), description: localizedField() },
    publishedAt: { type: Date, default: null },
    updatedBy: { type: ObjectId, default: null },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pages', timestamps: true, minimize: false },
);

pageSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
pageSchema.index({ isHome: 1 }, { partialFilterExpression: { isHome: true } });
pageSchema.plugin(localized, {
  fields: ['title', 'seo.title', 'seo.description', 'texts.*.value'],
});

export const Page = mongoose.models.Page ?? mongoose.model('Page', pageSchema);
