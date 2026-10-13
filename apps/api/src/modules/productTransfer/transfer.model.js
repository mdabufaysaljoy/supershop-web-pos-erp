import mongoose from 'mongoose';

/**
 * Product import/export job: one document per run. Holds status, progress counts and the
 * row-level validation report (capped). Files live in private storage (`fileKey` = uploaded
 * import, deleted after processing; `resultKey` = export result, deleted after `expiresAt`).
 */
const transferJobSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // import | export
    status: { type: String, default: 'queued' }, // queued | running | done | failed
    format: { type: String, required: true }, // csv | xlsx
    fileName: { type: String, default: null },
    mode: { type: String, default: null }, // import: upsert | create
    dryRun: { type: Boolean, default: false },
    filters: { type: mongoose.Schema.Types.Mixed, default: null }, // export filters
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    counts: {
      rows: { type: Number, default: 0 },
      products: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    /** First N row errors: `{ row, column, message }` (message = i18n key). */
    report: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errorCount: { type: Number, default: 0 },
    /** Header columns that were not recognized (ignored). */
    ignoredColumns: { type: [String], default: [] },
    /** Job-level failure reason (i18n key), when status = failed. */
    failure: { type: String, default: null },
    fileKey: { type: String, default: null },
    resultKey: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'product_transfer_jobs', timestamps: true },
);
transferJobSchema.index({ createdBy: 1, createdAt: -1 });
transferJobSchema.index({ expiresAt: 1 });
transferJobSchema.index({ status: 1 });

export const TransferJob =
  mongoose.models.TransferJob ?? mongoose.model('TransferJob', transferJobSchema);
