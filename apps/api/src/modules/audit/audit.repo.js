import { AuditLog } from './audit.model.js';

/** Insert-only. Duplicate eventId (re-delivered event) is ignored. */
export async function insertAuditEntry(entry) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
}

export async function findAuditEntries({
  page,
  limit,
  sort,
  action,
  actorId,
  entityType,
  entityId,
  from,
  to,
}) {
  const filter = {};
  if (action) filter.action = action;
  if (actorId) filter.actorId = actorId;
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  if (from || to) filter.at = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ [sort.field]: sort.direction, _id: sort.direction })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, total };
}
