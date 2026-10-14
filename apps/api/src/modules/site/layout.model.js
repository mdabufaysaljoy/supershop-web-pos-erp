import mongoose from 'mongoose';
import { THEME } from '@supershop/shared';
import { localized, LocalizedString } from '../i18n/index.js';

const { ObjectId } = mongoose.Schema.Types;
const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

/**
 * The site's chrome (P5.4): one document, because every page of the storefront needs all of it on
 * every request. Announcement text and the footer note are localized like any other content;
 * theme tokens are plain values the layout prints as CSS variables.
 */
const layoutSchema = new mongoose.Schema(
  {
    /** Singleton guard: exactly one document, `default`. */
    key: { type: String, required: true, unique: true, default: 'default' },
    headerMenuId: { type: ObjectId, default: null },
    /** With no header menu, the header shows the shop's own categories. */
    showCategoryRow: { type: Boolean, default: true },
    announcement: {
      enabled: { type: Boolean, default: false },
      text: localizedField(),
      href: { type: String, default: '' },
      tone: { type: String, enum: ['primary', 'dark', 'light'], default: 'primary' },
    },
    footer: {
      note: localizedField(),
      menuIds: { type: [ObjectId], default: [] },
    },
    theme: {
      primary: { type: String, default: THEME.DEFAULTS.primary },
      primaryForeground: { type: String, default: THEME.DEFAULTS.primaryForeground },
      radius: { type: String, enum: THEME.RADII, default: THEME.DEFAULTS.radius },
      font: { type: String, enum: THEME.FONTS, default: THEME.DEFAULTS.font },
    },
    updatedBy: { type: ObjectId, default: null },
  },
  { collection: 'site_layout', timestamps: true, minimize: false },
);

layoutSchema.plugin(localized, { fields: ['announcement.text', 'footer.note'] });

export const SiteLayout = mongoose.models.SiteLayout ?? mongoose.model('SiteLayout', layoutSchema);
