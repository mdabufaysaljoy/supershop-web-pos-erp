import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;
const localizedField = () => ({ type: LocalizedString, default: () => ({}) });
const ACTIVE_ONLY = { deletedAt: { $type: 'null' } };

/**
 * Product = aggregate root (CLAUDE.md §4): content, classification, gallery, options
 * (e.g. Color × Size) and denormalized price range. Sellable units are `Variant`s.
 * Text is English source, auto-translated — including option names and option value labels.
 */
const optionValueSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: localizedField(),
    swatch: { type: String, default: null },
  },
  { _id: false },
);
const optionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: localizedField(),
    values: { type: [optionValueSchema], default: [] },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    name: localizedField(),
    slug: { type: String, required: true },
    shortDescription: localizedField(),
    description: localizedField(),
    status: { type: String, default: 'draft' },
    categoryIds: { type: [ObjectId], default: [] },
    brandId: { type: ObjectId, default: null },
    supplierId: { type: ObjectId, default: null },
    /** Ordered gallery (media ids); the first is the main image. */
    imageIds: { type: [ObjectId], default: [] },
    options: { type: [optionSchema], default: [] },
    tags: { type: [String], default: [] },
    taxCategory: { type: String, default: 'standard' },
    /** Values of `product` custom fields, keyed by field key. */
    customFields: { type: Mixed, default: () => ({}) },
    seo: { title: localizedField(), description: localizedField() },
    /** Denormalized from active variants (listing/sorting without a join). */
    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 0 },
    variantCount: { type: Number, default: 0 },
    createdBy: { type: ObjectId, default: null },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'products', timestamps: true, minimize: false },
);
productSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: ACTIVE_ONLY });
productSchema.index({ deletedAt: 1, status: 1, updatedAt: -1 });
productSchema.index({ categoryIds: 1 });
productSchema.index({ brandId: 1 });
productSchema.index({ supplierId: 1 });
productSchema.index({ tags: 1 });
productSchema.plugin(localized, {
  fields: [
    'name',
    'shortDescription',
    'description',
    'seo.title',
    'seo.description',
    'options.*.name',
    'options.*.values.*.label',
  ],
});

/**
 * Variant = one sellable combination (SKU). Money in integer halalas. `cost` is sensitive
 * (product.viewCost). Stock lives in the inventory ledger (P2.2), keyed by variant id.
 */
const variantSchema = new mongoose.Schema(
  {
    productId: { type: ObjectId, required: true },
    sku: { type: String, required: true },
    barcode: { type: String, default: null },
    /** `{ [optionKey]: valueKey }`; empty for the default variant of a product without options. */
    optionValues: { type: Mixed, default: () => ({}) },
    /** Canonical combination (`color=red|size=m`), unique per product. */
    optionsKey: { type: String, default: '' },
    price: { type: Number, required: true },
    compareAtPrice: { type: Number, default: null },
    cost: { type: Number, default: null },
    /** Images of this variant (subset of the product gallery); the first is its main image. */
    imageIds: { type: [ObjectId], default: [] },
    weightGrams: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'variants', timestamps: true, minimize: false },
);
variantSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: ACTIVE_ONLY });
variantSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { ...ACTIVE_ONLY, barcode: { $type: 'string' } } },
);
variantSchema.index(
  { productId: 1, optionsKey: 1 },
  { unique: true, partialFilterExpression: ACTIVE_ONLY },
);

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);
export const Variant = mongoose.models.Variant ?? mongoose.model('Variant', variantSchema);
