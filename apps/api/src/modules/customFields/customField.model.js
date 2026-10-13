import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

/**
 * Custom field definition (CLAUDE.md §2.4). `entity` + `key` + `type` are immutable and the key is
 * never reused (even after delete) so stored values can't be misread by a newer definition.
 */
const customFieldSchema = new mongoose.Schema(
  {
    entity: { type: String, required: true },
    key: { type: String, required: true },
    type: { type: String, required: true },
    label: localizedField(),
    placeholder: localizedField(),
    helpText: localizedField(),
    options: {
      type: [new mongoose.Schema({ key: String, label: localizedField() }, { _id: false })],
      default: [],
    },
    required: { type: Boolean, default: false },
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    /** 'public' values are shown on the storefront; 'admin' only in the back office. */
    visibility: { type: String, default: 'admin' },
    position: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'custom_field_defs', timestamps: true },
);
customFieldSchema.index({ entity: 1, key: 1 }, { unique: true });
customFieldSchema.plugin(localized, {
  fields: ['label', 'placeholder', 'helpText', 'options.*.label'],
});

export const CustomFieldDef =
  mongoose.models.CustomFieldDef ?? mongoose.model('CustomFieldDef', customFieldSchema);
