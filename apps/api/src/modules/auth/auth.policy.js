import { PRINCIPAL_TYPES } from '@supershop/shared';

/**
 * Auth security policy per principal type. Defaults follow OWASP guidance.
 * Admin-editable parts (lockout, session lifetimes) are overlaid at call time by a provider the
 * composition root installs from settings (`security.*`) — auth does not import the settings
 * module (that would create an import cycle via the authorize middleware).
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const shared = Object.freeze({
  accessTokenTtlSec: 15 * 60,
  lockout: Object.freeze({ maxAttempts: 5, lockMs: 15 * MINUTE }),
  passwordResetTtlMs: 30 * MINUTE,
  emailVerifyTtlMs: 48 * HOUR,
  /** Two tabs refreshing at once: the loser's (just-rotated) token is rejected without revoking. */
  refreshReuseGraceMs: 10_000,
  maxActiveSessions: 10,
});

export const AUTH_POLICY = Object.freeze({
  [PRINCIPAL_TYPES.STAFF]: Object.freeze({
    ...shared,
    audience: 'supershop:staff',
    // A POS shift-length idle window; must log in again at least weekly.
    refreshIdleMs: 12 * HOUR,
    refreshAbsoluteMs: 7 * DAY,
  }),
  [PRINCIPAL_TYPES.CUSTOMER]: Object.freeze({
    ...shared,
    audience: 'supershop:customer',
    refreshIdleMs: 30 * DAY,
    refreshAbsoluteMs: 90 * DAY,
  }),
});

export const ISSUER = 'supershop-api';

/** @type {(type: string) => Partial<typeof AUTH_POLICY.staff>} */
let overrides = () => ({});

/** Installed once from modules/index.js. */
export function setAuthPolicyProvider(fn) {
  overrides = fn;
}

/** @param {string} type */
export function policyFor(type) {
  const p = AUTH_POLICY[type];
  if (!p) throw new Error(`Unknown principal type "${type}"`);
  return { ...p, ...overrides(type) };
}

export const TIME = Object.freeze({ MINUTE, HOUR, DAY });
