import { UnauthenticatedError } from '../../core/errors.js';
import { assertSessionActive } from './auth.service.js';
import { verifyAccessToken } from './tokens.js';

const BEARER_RE = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/;

/**
 * Requires a valid access token of the given principal type AND a live session.
 * Sets `req.auth = { type, principalId, sessionId }`. Authorization (permissions, branch scope)
 * is layered on top by the RBAC middleware (P0.5).
 * Errors: 401 UNAUTHENTICATED (no token), TOKEN_EXPIRED (client should refresh), TOKEN_INVALID.
 * @param {'staff' | 'customer'} type
 */
export function requireAuth(type) {
  return async function authenticate(req, _res, next) {
    const m = BEARER_RE.exec(req.get('authorization') ?? '');
    if (!m) throw new UnauthenticatedError();
    const claims = await verifyAccessToken(m[1], type);
    await assertSessionActive(type, claims.sessionId, claims.principalId);
    req.auth = Object.freeze({
      type,
      principalId: claims.principalId,
      sessionId: claims.sessionId,
    });
    next();
  };
}

/**
 * Like `requireAuth` but anonymous requests pass (`req.auth` stays undefined). A PRESENT but
 * expired/invalid token still fails, so clients refresh instead of silently acting as a guest.
 * @param {'staff' | 'customer'} type
 */
export function optionalAuth(type) {
  const authenticate = requireAuth(type);
  return async function maybeAuthenticate(req, res, next) {
    if (!req.get('authorization')) return next();
    return authenticate(req, res, next);
  };
}
