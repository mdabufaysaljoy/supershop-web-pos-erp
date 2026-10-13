import { eventBus } from '../../core/events.js';
import { auditedEvents, recordEvent } from './audit.service.js';

/** Subscribes the audit trail to every mapped domain event. */
export function registerAuditSubscribers() {
  for (const name of auditedEvents()) eventBus.on(name, recordEvent);
}
