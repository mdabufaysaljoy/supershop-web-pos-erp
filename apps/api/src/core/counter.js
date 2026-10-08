import mongoose from 'mongoose';

/**
 * Atomic named sequences for human-facing numbers (order no, receipt no, invoice no).
 * Infrastructure, not a feature module: callers use `nextSequence`, never the model.
 *
 * Gapless numbering (needed for tax invoices): call inside `withTransaction` and pass `session`;
 * an aborted transaction rolls the increment back. Outside a transaction, numbers are unique and
 * increasing but may have gaps.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', versionKey: false, timestamps: { createdAt: false, updatedAt: true } },
);

const Counter = mongoose.models.Counter ?? mongoose.model('Counter', counterSchema);

/** Keys like `order`, `receipt:branch:<id>`, `invoice:2026`. */
const KEY_RE = /^[a-zA-Z0-9:_.-]{1,120}$/;

/**
 * Returns the next value (starting at 1) for `key`.
 * @param {string} key
 * @param {{ session?: import('mongoose').ClientSession }} [opts]
 * @returns {Promise<number>}
 */
export async function nextSequence(key, { session } = {}) {
  if (!KEY_RE.test(key)) throw new Error(`Invalid counter key "${key}"`);
  const run = () =>
    Counter.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after', session, lean: true },
    );
  try {
    return (await run()).seq;
  } catch (err) {
    // Two concurrent upserts creating the same new key: one gets E11000 — retry once, the doc now exists.
    // (Inside a transaction, the driver's transaction retry handles write conflicts instead.)
    if (err?.code === 11000 && !session) return (await run()).seq;
    throw err;
  }
}

/**
 * Formats a sequence number: formatSequence(42, { prefix: 'INV-', pad: 6 }) → 'INV-000042'.
 * @param {number} n
 * @param {{ prefix?: string, pad?: number }} [opts]
 */
export function formatSequence(n, { prefix = '', pad = 6 } = {}) {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new RangeError('sequence must be a positive integer');
  return `${prefix}${String(n).padStart(pad, '0')}`;
}
