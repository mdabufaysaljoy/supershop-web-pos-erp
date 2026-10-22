import { logger } from '../../core/logger.js';
import * as repo from './alert.repo.js';

const str = (id) => (id == null ? null : String(id));

const toDto = (a, staffId) => ({
  id: str(a._id),
  type: a.type,
  title: a.title,
  body: a.body ?? '',
  link: a.link ?? null,
  entity: a.entity?.type ? { type: a.entity.type, id: a.entity.id } : null,
  read: (a.readBy ?? []).some((id) => String(id) === String(staffId)),
  at: a.createdAt,
});

/**
 * Records something the shop should know about. Never throws into the caller: a notice that
 * cannot be written must not take a sale down with it.
 * @param {{ type: string, title: string, body?: string, link?: string|null,
 *           permission?: string|null, entity?: { type: string, id: string } }} alert
 */
export async function raiseAlert(alert) {
  try {
    return await repo.insertAlert({
      type: alert.type,
      title: alert.title,
      body: alert.body ?? '',
      link: alert.link ?? null,
      permission: alert.permission ?? null,
      entity: alert.entity ?? { type: null, id: null },
    });
  } catch (err) {
    logger.error({ err: { message: err.message }, type: alert.type }, 'alert not recorded');
    return null;
  }
}

/** What the bell shows this staff member, and how many of them they have not seen. */
export async function listAlerts(actor, { limit = 20 } = {}) {
  const permissions = scopeOf(actor);
  const [items, unread] = await Promise.all([
    repo.listRecent(permissions, limit),
    repo.countUnread(permissions, actor.staffId),
  ]);
  return { items: items.map((a) => toDto(a, actor.staffId)), unread };
}

export const markAlertsRead = (actor, ids) => repo.markRead(scopeOf(actor), actor.staffId, ids);

/** What this person is allowed to be told about: their permissions, or all of them. */
const scopeOf = (actor) => (actor.isSuperAdmin ? everything : (actor.permissions ?? []));

/**
 * A super-admin sees everything, and the query matches on a LIST of permissions — so theirs is
 * "every permission there is", set once at the composition root.
 */
let everything = [];
export function setAllPermissions(list) {
  everything = list;
}
