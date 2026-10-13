import { ERROR_CODES, EVENTS } from '@supershop/shared';
import { AppError, UnauthenticatedError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import * as repo from './auth.repo.js';
import { policyFor } from './auth.policy.js';
import { dummyHash, hashPassword, needsRehash, verifyPassword } from './password.js';
import { principalAdapter } from './principals.js';
import {
  hashOneTimeToken,
  newOneTimeToken,
  newRefreshToken,
  parseRefreshToken,
  signAccessToken,
} from './tokens.js';

/**
 * Authentication use cases for every principal type (staff, customer).
 * Errors are deliberately generic where detail would enable account enumeration.
 *
 * @typedef {{ ip?: string, userAgent?: string, requestId?: string }} RequestContext
 * @typedef {{ accessToken: string, expiresIn: number, refreshToken: string, refreshExpiresAt: Date }} SessionTokens
 */

const invalidCredentials = () =>
  new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid credentials', { status: 401 });
const invalidRefresh = () =>
  new AppError(ERROR_CODES.TOKEN_INVALID, 'Invalid session', { status: 401 });
const invalidOneTimeToken = () =>
  new AppError(ERROR_CODES.TOKEN_INVALID, 'Invalid or expired link', { status: 400 });

const emit = (name, payload, ctx) => {
  void eventBus.emit(name, payload, { requestId: ctx?.requestId });
};

const minDate = (a, b) => (a.getTime() < b.getTime() ? a : b);

// ---------------------------------------------------------------- sessions

/**
 * Starts a new session (refresh-token family) and returns tokens. Enforces the concurrent
 * session cap by revoking the oldest sessions.
 * @param {string} type
 * @param {string} principalId
 * @param {RequestContext} [ctx]
 * @returns {Promise<SessionTokens>}
 */
export async function issueSession(type, principalId, ctx = {}) {
  const policy = policyFor(type);
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + policy.refreshAbsoluteMs);
  const idleExpiresAt = minDate(new Date(now + policy.refreshIdleMs), absoluteExpiresAt);

  const sessionId = repo.newSessionId();
  const refresh = newRefreshToken(sessionId);
  await repo.createSession({
    _id: sessionId,
    principalType: type,
    principalId,
    tokenHash: refresh.hash,
    idleExpiresAt,
    absoluteExpiresAt,
    lastUsedAt: new Date(now),
    userAgent: ctx.userAgent?.slice(0, 256),
    ip: ctx.ip?.slice(0, 64),
  });

  const excess = await repo.findExcessSessionIds(type, principalId, policy.maxActiveSessions);
  await repo.revokeSessionsByIds(excess, 'session_limit');

  const access = await signAccessToken({ type, principalId: String(principalId), sessionId });
  return { ...access, refreshToken: refresh.token, refreshExpiresAt: idleExpiresAt };
}

/**
 * Rotates a refresh token. Reuse of an old token (outside the grace window) revokes the session.
 * @param {string} type
 * @param {string | undefined} refreshToken
 * @param {RequestContext} [ctx]
 * @returns {Promise<SessionTokens>}
 */
export async function refreshSession(type, refreshToken, ctx = {}) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) throw invalidRefresh();
  const policy = policyFor(type);
  const session = await repo.findSessionById(parsed.sessionId);
  const now = Date.now();

  if (
    !session ||
    session.principalType !== type ||
    session.revokedAt ||
    session.absoluteExpiresAt.getTime() <= now ||
    session.idleExpiresAt.getTime() <= now
  ) {
    throw invalidRefresh();
  }

  if (parsed.hash !== session.tokenHash) {
    const benignRace =
      parsed.hash === session.prevTokenHash &&
      session.rotatedAt &&
      now - session.rotatedAt.getTime() < policy.refreshReuseGraceMs;
    if (!benignRace) {
      await repo.revokeSession(session._id, 'refresh_reuse');
      logger.warn(
        { sessionId: String(session._id), principalType: type },
        'refresh token reuse detected',
      );
      emit(
        EVENTS.AUTH_REFRESH_REUSE_DETECTED,
        {
          principalType: type,
          principalId: String(session.principalId),
          sessionId: String(session._id),
          ip: ctx.ip,
        },
        ctx,
      );
    }
    throw invalidRefresh();
  }

  const principal = await principalAdapter(type).findById(String(session.principalId));
  if (!principal || principal.status !== 'active') {
    await repo.revokeSession(session._id, 'principal_inactive');
    throw invalidRefresh();
  }

  const refresh = newRefreshToken(String(session._id));
  const idleExpiresAt = minDate(new Date(now + policy.refreshIdleMs), session.absoluteExpiresAt);
  const rotated = await repo.rotateSession(session._id, parsed.hash, {
    newHash: refresh.hash,
    idleExpiresAt,
  });
  if (!rotated) throw invalidRefresh(); // concurrent refresh won; client retries with the new cookie

  const access = await signAccessToken({
    type,
    principalId: String(session.principalId),
    sessionId: String(session._id),
  });
  return { ...access, refreshToken: refresh.token, refreshExpiresAt: idleExpiresAt };
}

/**
 * Ends the session behind a refresh token. Idempotent; never reveals whether it existed.
 * @param {string} type
 * @param {string | undefined} refreshToken
 */
export async function logout(type, refreshToken, ctx = {}) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return;
  const session = await repo.findSessionById(parsed.sessionId);
  // Require the current (or just-rotated) secret so a leaked session id alone can't log users out.
  if (
    !session ||
    session.principalType !== type ||
    ![session.tokenHash, session.prevTokenHash].includes(parsed.hash)
  ) {
    return;
  }
  await repo.revokeSession(session._id, 'logout');
  emit(
    EVENTS.AUTH_LOGGED_OUT,
    { principalType: type, principalId: String(session.principalId) },
    ctx,
  );
}

/** Revokes every session of a principal (logout everywhere, password change, staff disabled). */
export async function revokeAllSessions(
  type,
  principalId,
  reason = 'logout_all',
  { exceptSessionId, ctx } = {},
) {
  const count = await repo.revokeSessionsOf(type, principalId, reason, {
    exceptId: exceptSessionId,
  });
  emit(
    EVENTS.AUTH_SESSIONS_REVOKED,
    { principalType: type, principalId: String(principalId), reason, count },
    ctx,
  );
  return count;
}

/**
 * Per-request check for access tokens: the session must still be live (so logout/revocation
 * takes effect immediately, not after the access token expires).
 */
export async function assertSessionActive(type, sessionId, principalId) {
  const s = await repo.findActiveSession(sessionId, type);
  if (!s || String(s.principalId) !== principalId) {
    throw new AppError(ERROR_CODES.TOKEN_INVALID, 'Session ended', { status: 401 });
  }
}

// ---------------------------------------------------------------- login

/**
 * @param {string} type
 * @param {{ identifier: string, password: string }} input
 * @param {RequestContext} [ctx]
 * @returns {Promise<SessionTokens & { profile: object }>}
 */
export async function login(type, { identifier, password }, ctx = {}) {
  const policy = policyFor(type);
  const adapter = principalAdapter(type);

  const principal = await adapter.findByLoginIdentifier(identifier);
  const cred = principal ? await repo.findCredential(type, principal.id) : null;

  // Always run one hash verification, even for unknown accounts (timing-safe enumeration defense).
  const ok = await verifyPassword(cred?.passwordHash ?? (await dummyHash()), password);

  const fail = (reason) => {
    emit(
      EVENTS.AUTH_LOGIN_FAILED,
      { principalType: type, principalId: principal?.id ?? null, reason, ip: ctx.ip },
      ctx,
    );
    return invalidCredentials();
  };

  if (!principal || !cred) throw fail('unknown_account');

  if (cred.lockedUntil && cred.lockedUntil.getTime() > Date.now()) {
    // Only someone who knows the password learns that the account is locked.
    if (ok)
      throw new AppError(ERROR_CODES.ACCOUNT_LOCKED, 'Account temporarily locked', { status: 423 });
    throw fail('locked');
  }

  if (!ok) {
    const { locked, lockedUntil } = await repo.recordLoginFailure(cred._id, policy.lockout);
    if (locked) {
      emit(
        EVENTS.AUTH_ACCOUNT_LOCKED,
        { principalType: type, principalId: principal.id, lockedUntil },
        ctx,
      );
    }
    throw fail('bad_password');
  }

  if (principal.status !== 'active') {
    throw new AppError(ERROR_CODES.ACCOUNT_DISABLED, 'Account disabled', { status: 403 });
  }

  await repo.recordLoginSuccess(cred._id);
  if (needsRehash(cred.passwordHash)) {
    await repo.updatePasswordHash(cred._id, await hashPassword(password));
  }

  const tokens = await issueSession(type, principal.id, ctx);
  emit(
    EVENTS.AUTH_LOGIN_SUCCEEDED,
    { principalType: type, principalId: principal.id, ip: ctx.ip },
    ctx,
  );
  const profile = await adapter.getProfile(principal.id);
  return { ...tokens, profile };
}

// ---------------------------------------------------------------- passwords

/**
 * Sets (or replaces) a principal's password. Used by account creation and reset flows.
 * @param {string} type
 * @param {string} principalId
 * @param {string} plain  already validated against the password policy
 * @param {{ session?: import('mongoose').ClientSession }} [opts]
 */
export async function setPassword(type, principalId, plain, opts) {
  policyFor(type);
  await repo.upsertPassword(type, principalId, await hashPassword(plain), opts);
}

/**
 * Authenticated password change: verifies the current password, then signs out every OTHER
 * session (the current device stays logged in).
 */
export async function changePassword(
  type,
  { principalId, sessionId },
  { currentPassword, newPassword },
  ctx = {},
) {
  const cred = await repo.findCredential(type, principalId);
  if (!cred || !(await verifyPassword(cred.passwordHash, currentPassword))) {
    throw invalidCredentials();
  }
  await setPassword(type, principalId, newPassword);
  await revokeAllSessions(type, principalId, 'password_changed', {
    exceptSessionId: sessionId,
    ctx,
  });
  emit(EVENTS.AUTH_PASSWORD_CHANGED, { principalType: type, principalId }, ctx);
}

/**
 * Starts a password reset. Always resolves (never reveals whether the email exists).
 * The raw token travels only in the event payload → email subscriber builds the link.
 */
export async function requestPasswordReset(type, email, ctx = {}) {
  const principal = await principalAdapter(type).findByEmail(email);
  if (!principal || principal.status !== 'active') return;
  const { token, hash } = newOneTimeToken();
  const expiresAt = new Date(Date.now() + policyFor(type).passwordResetTtlMs);
  await repo.replaceAuthToken({
    principalType: type,
    principalId: principal.id,
    purpose: 'password_reset',
    tokenHash: hash,
    expiresAt,
  });
  emit(
    EVENTS.AUTH_PASSWORD_RESET_REQUESTED,
    { principalType: type, principalId: principal.id, token, expiresAt },
    ctx,
  );
}

/** Completes a reset: sets the password, unlocks, and signs out all sessions. */
export async function resetPassword(type, { token, password }, ctx = {}) {
  const doc = await repo.consumeAuthToken(hashOneTimeToken(token), 'password_reset', type);
  if (!doc) throw invalidOneTimeToken();
  const principalId = String(doc.principalId);
  const principal = await principalAdapter(type).findById(principalId);
  if (!principal || principal.status !== 'active') throw invalidOneTimeToken();

  await setPassword(type, principalId, password);
  await revokeAllSessions(type, principalId, 'password_reset', { ctx });
  // Reset proves control of the email address.
  await principalAdapter(type).markEmailVerified?.(principalId);
  emit(EVENTS.AUTH_PASSWORD_CHANGED, { principalType: type, principalId, via: 'reset' }, ctx);
}

// ---------------------------------------------------------------- email verification

/** Issues an email-verification token (raw token goes to the email subscriber via the event). */
export async function requestEmailVerification(type, principalId, ctx = {}) {
  const principal = await principalAdapter(type).findById(principalId);
  if (!principal?.email) return;
  const { token, hash } = newOneTimeToken();
  const expiresAt = new Date(Date.now() + policyFor(type).emailVerifyTtlMs);
  await repo.replaceAuthToken({
    principalType: type,
    principalId,
    purpose: 'email_verify',
    tokenHash: hash,
    expiresAt,
  });
  emit(
    EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED,
    { principalType: type, principalId, token, expiresAt },
    ctx,
  );
}

export async function verifyEmail(type, token, ctx = {}) {
  const adapter = principalAdapter(type);
  if (!adapter.markEmailVerified) throw invalidOneTimeToken();
  const doc = await repo.consumeAuthToken(hashOneTimeToken(token), 'email_verify', type);
  if (!doc) throw invalidOneTimeToken();
  await adapter.markEmailVerified(String(doc.principalId));
  emit(
    EVENTS.AUTH_EMAIL_VERIFIED,
    { principalType: type, principalId: String(doc.principalId) },
    ctx,
  );
}

// ---------------------------------------------------------------- profile

export async function getProfile(type, principalId) {
  const profile = await principalAdapter(type).getProfile(principalId);
  if (!profile) throw new UnauthenticatedError();
  return profile;
}
