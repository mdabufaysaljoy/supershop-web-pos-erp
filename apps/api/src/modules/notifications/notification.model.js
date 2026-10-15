import mongoose from 'mongoose';
import { localized, LocalizedString } from '../i18n/index.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;
const localizedField = () => ({ type: LocalizedString, default: () => ({}) });

/**
 * A message the shop sends when something happens (P4.5). English is authored and Arabic is
 * generated like any other content (§5.7), so a shop writes its wording once and every customer
 * reads it in their own language.
 */
const templateSchema = new mongoose.Schema(
  {
    /** `<event>.<channel>`, e.g. `order.shipped.email` — stable, referenced by the sender. */
    key: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    channel: { type: String, required: true, enum: ['email', 'sms'] },
    subject: localizedField(),
    body: localizedField(),
    enabled: { type: Boolean, default: true },
    /** Seeded templates can be edited and switched off, never deleted. */
    builtIn: { type: Boolean, default: false },
  },
  { collection: 'notification_templates', timestamps: true },
);
templateSchema.plugin(localized, { fields: ['subject', 'body'] });

export const NotificationTemplate =
  mongoose.models.NotificationTemplate ?? mongoose.model('NotificationTemplate', templateSchema);

/**
 * What was sent, to whom and what came of it — the admin's answer to "did the customer get it?".
 * Bodies are kept so staff can see exactly what went out; recipients are stored as given.
 */
const logSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true },
    event: { type: String, required: true },
    templateKey: { type: String, default: null },
    to: { type: String, required: true },
    lang: { type: String, required: true },
    subject: { type: String, default: null },
    body: { type: String, required: true },
    status: { type: String, required: true, enum: ['sent', 'failed', 'skipped'], default: 'sent' },
    provider: { type: String, default: null },
    providerRef: { type: String, default: null },
    error: { type: String, default: null },
    /** What this was about (an order, a customer…) — for the order screen's timeline later. */
    ref: { type: Mixed, default: null },
    orderId: { type: ObjectId, default: null },
  },
  { collection: 'notification_logs', timestamps: { createdAt: true, updatedAt: false } },
);
logSchema.index({ createdAt: -1 });
logSchema.index({ orderId: 1, createdAt: -1 });

export const NotificationLog =
  mongoose.models.NotificationLog ?? mongoose.model('NotificationLog', logSchema);
