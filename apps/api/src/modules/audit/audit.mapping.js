import { EVENTS } from '@supershop/shared';

/**
 * Event → audit entry mapping. Explicit per event (allow-list): fields are picked, never copied
 * wholesale, so one-time tokens and other secrets in event payloads can't leak into the trail.
 * Return shape: { actorType, actorId, entityType, entityId, before?, after?, data? }.
 */
const principal = (p) => ({
  actorType: p.principalType,
  actorId: p.principalId ?? null,
  entityType: p.principalType,
  entityId: p.principalId ?? null,
});
const staffActor = (p) =>
  p.actorId ? { actorType: 'staff', actorId: p.actorId } : { actorType: 'system', actorId: null };

/** @type {Record<string, (payload: any) => object>} */
export const AUDIT_MAPPINGS = {
  // auth (actor = the principal themselves; failed logins may be anonymous)
  [EVENTS.AUTH_LOGIN_SUCCEEDED]: (p) => ({ ...principal(p), data: { ip: p.ip } }),
  [EVENTS.AUTH_LOGIN_FAILED]: (p) => ({
    ...principal(p),
    actorType: p.principalId ? p.principalType : 'anonymous',
    data: { reason: p.reason, ip: p.ip, principalType: p.principalType },
  }),
  [EVENTS.AUTH_ACCOUNT_LOCKED]: (p) => ({ ...principal(p), data: { lockedUntil: p.lockedUntil } }),
  [EVENTS.AUTH_LOGGED_OUT]: (p) => principal(p),
  [EVENTS.AUTH_SESSIONS_REVOKED]: (p) => ({
    ...principal(p),
    data: { reason: p.reason, count: p.count },
  }),
  [EVENTS.AUTH_REFRESH_REUSE_DETECTED]: (p) => ({
    ...principal(p),
    data: { sessionId: p.sessionId, ip: p.ip },
  }),
  [EVENTS.AUTH_PASSWORD_CHANGED]: (p) => ({ ...principal(p), data: { via: p.via ?? 'change' } }),
  // token deliberately NOT recorded
  [EVENTS.AUTH_PASSWORD_RESET_REQUESTED]: (p) => ({
    ...principal(p),
    data: { expiresAt: p.expiresAt },
  }),
  [EVENTS.AUTH_EMAIL_VERIFIED]: (p) => principal(p),

  // staff & roles
  [EVENTS.STAFF_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'staff',
    entityId: p.staffId,
    after: p.after,
  }),
  [EVENTS.STAFF_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'staff',
    entityId: p.staffId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.STAFF_DISABLED]: (p) => ({ ...staffActor(p), entityType: 'staff', entityId: p.staffId }),
  [EVENTS.STAFF_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'staff',
    entityId: p.staffId,
    before: p.before,
  }),
  [EVENTS.ROLE_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'role',
    entityId: p.roleId,
    after: p.after,
  }),
  [EVENTS.ROLE_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'role',
    entityId: p.roleId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.ROLE_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'role',
    entityId: p.roleId,
    before: p.before,
  }),
  [EVENTS.ACCESS_SUPER_ADMIN_USED]: (p) => ({
    actorType: 'staff',
    actorId: p.staffId,
    entityType: 'request',
    data: { method: p.method, path: p.path, permissions: p.permissions },
  }),

  // media library
  [EVENTS.MEDIA_UPLOADED]: (p) => ({
    ...staffActor(p),
    entityType: 'media',
    entityId: p.mediaId,
    after: p.after,
  }),
  [EVENTS.MEDIA_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'media',
    entityId: p.mediaId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.MEDIA_DELETED]: (p) => ({ ...staffActor(p), entityType: 'media', entityId: p.mediaId }),

  // categories
  [EVENTS.CATEGORY_CREATED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
    after: p.after,
  }),
  [EVENTS.CATEGORY_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.CATEGORY_MOVED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.CATEGORY_DELETED]: (p) => ({
    ...staffActor(p),
    entityType: 'category',
    entityId: p.categoryId,
  }),

  // languages / translation
  [EVENTS.GLOSSARY_UPDATED]: (p) => ({
    ...staffActor(p),
    entityType: 'glossaryTerm',
    entityId: p.termId,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.UI_STRING_OVERRIDE_SET]: (p) => ({
    ...staffActor(p),
    entityType: 'uiString',
    entityId: `${p.catalog}:${p.lang}:${p.key}`,
    before: p.before,
    after: p.after,
  }),
  [EVENTS.UI_STRING_OVERRIDE_REMOVED]: (p) => ({
    ...staffActor(p),
    entityType: 'uiString',
    entityId: `${p.catalog}:${p.lang}:${p.key}`,
    before: p.before,
  }),
  [EVENTS.TRANSLATION_RETRANSLATE_REQUESTED]: (p) => ({
    ...staffActor(p),
    entityType: 'translation',
    data: { scope: p.scope, scheduled: p.scheduled },
  }),

  // settings: one entry per changed key (expanded in the subscriber); values already masked
  [EVENTS.SETTINGS_UPDATED]: (p) =>
    p.changes.map((c) => ({
      ...staffActor(p),
      entityType: 'setting',
      entityId: c.key,
      before: c.before,
      after: c.after,
    })),
};

/** Last line of defense: strip secret-looking fields anywhere in before/after/data. */
const SECRET_KEY_RE =
  /^(password|passwordHash|token|refreshToken|accessToken|secret|apiKey|encryptedValue)$/i;
export function scrubSecrets(value, depth = 0) {
  if (depth > 10 || value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SECRET_KEY_RE.test(k) ? '[REDACTED]' : scrubSecrets(v, depth + 1),
    ]),
  );
}
