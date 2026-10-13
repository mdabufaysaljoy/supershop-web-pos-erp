import mongoose from 'mongoose';

/**
 * Append-only audit trail (CLAUDE.md §2.5): who / when / what / before / after.
 * There is deliberately NO update or delete path in the code. Retention: forever (financial &
 * security records); an archival job can be added later if size requires.
 */
const auditSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true, default: () => new Date() },
    action: { type: String, required: true }, // domain event name, e.g. 'role.updated'
    actorType: { type: String, enum: ['staff', 'customer', 'system', 'anonymous'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    requestId: { type: String, default: null },
    eventId: { type: String, required: true, unique: true }, // idempotency: one row per event
  },
  { collection: 'audit_logs', versionKey: false, minimize: false },
);
auditSchema.index({ at: -1 });
auditSchema.index({ action: 1, at: -1 });
auditSchema.index({ actorId: 1, at: -1 });
auditSchema.index({ entityType: 1, entityId: 1, at: -1 });

export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditSchema);
