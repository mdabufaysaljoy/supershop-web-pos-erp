import { logger } from '../../core/logger.js';
import { AUDIT_MAPPINGS, scrubSecrets } from './audit.mapping.js';
import * as repo from './audit.repo.js';

/**
 * Records a domain event in the audit trail. Never throws (auditing must not break the action);
 * failures are logged at error level for alerting.
 * @param {import('../../core/events.js').DomainEvent} event
 */
export async function recordEvent(event) {
  const map = AUDIT_MAPPINGS[event.name];
  if (!map) return;
  try {
    const mapped = [map(event.payload)].flat();
    await Promise.all(
      mapped.map((m, i) =>
        repo.insertAuditEntry({
          at: new Date(event.occurredAt),
          action: event.name,
          actorType: m.actorType,
          actorId: m.actorId ?? null,
          entityType: m.entityType ?? null,
          entityId: m.entityId == null ? null : String(m.entityId),
          before: scrubSecrets(m.before ?? null),
          after: scrubSecrets(m.after ?? null),
          data: scrubSecrets(m.data ?? null),
          requestId: event.meta?.requestId ?? null,
          eventId: mapped.length > 1 ? `${event.id}:${i}` : event.id,
        }),
      ),
    );
  } catch (err) {
    logger.error({ err, event: { id: event.id, name: event.name } }, 'audit write failed');
  }
}

export const auditedEvents = () => Object.keys(AUDIT_MAPPINGS);

const toDto = (e) => ({
  id: String(e._id),
  at: e.at,
  action: e.action,
  actorType: e.actorType,
  actorId: e.actorId ? String(e.actorId) : null,
  entityType: e.entityType,
  entityId: e.entityId,
  before: e.before,
  after: e.after,
  data: e.data,
  requestId: e.requestId,
});

export async function listAuditEntries(query) {
  const { items, total } = await repo.findAuditEntries(query);
  return { items: items.map(toDto), meta: { page: query.page, limit: query.limit, total } };
}
