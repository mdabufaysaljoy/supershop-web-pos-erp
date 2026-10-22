import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Something the shop should know about, shown on the bell in the admin (P-ALERTS).
 *
 * It is a NOTICE, not a record: the order, the return and the stock movement are the records, and
 * this only points at them. Old notices are dropped by the database itself after 30 days, because
 * nobody comes back to a month-old bell.
 */
const alertSchema = new mongoose.Schema(
  {
    /** What happened, e.g. `order.online` — the admin maps it to an icon and a line of text. */
    type: { type: String, required: true },
    /** Already-worded, in English: the admin is English-only in v1 (CLAUDE.md §5.7). */
    title: { type: String, required: true },
    body: { type: String, default: '' },
    /** Where clicking it goes, as an admin path. Null for a notice with nothing to open. */
    link: { type: String, default: null },
    /** Who may see it: a permission key. A cashier is not told about things they cannot open. */
    permission: { type: String, default: null },
    entity: {
      type: { type: String, default: null },
      id: { type: String, default: null },
    },
    /** Staff who have seen it. Shop-wide notices, read per person. */
    readBy: { type: [ObjectId], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'alerts', versionKey: false },
);

alertSchema.index({ createdAt: -1 });
/** Kept for 30 days, then dropped by Mongo itself. */
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Alert = mongoose.models.Alert ?? mongoose.model('Alert', alertSchema);
