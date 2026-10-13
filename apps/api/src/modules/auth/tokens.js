import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { ERROR_CODES } from '@supershop/shared';
import { config } from '../../core/config.js';
import { randomToken, sha256 } from '../../core/crypto.js';
import { AppError } from '../../core/errors.js';
import { ISSUER, policyFor } from './auth.policy.js';

/**
 * Token primitives.
 * - Access token: HS256 JWT, short-lived, audience per principal type (a customer token can never
 *   pass a staff route). Claims: sub, typ, sid (session id).
 * - Refresh token: opaque `<sessionId>.<secret>`; only sha256(secret) is stored.
 * - One-time tokens (password reset, email verify): opaque random; only sha256 is stored.
 */
const accessKey = new TextEncoder().encode(config.JWT_ACCESS_SECRET);

/**
 * @param {{ type: string, principalId: string, sessionId: string }} p
 * @returns {Promise<{ accessToken: string, expiresIn: number }>}
 */
export async function signAccessToken({ type, principalId, sessionId }) {
  const { audience, accessTokenTtlSec } = policyFor(type);
  const accessToken = await new SignJWT({ typ: type, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principalId)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${accessTokenTtlSec}s`)
    .sign(accessKey);
  return { accessToken, expiresIn: accessTokenTtlSec };
}

const tokenError = (code, message) => new AppError(code, message, { status: 401 });

/**
 * @param {string} token
 * @param {string} type expected principal type
 * @returns {Promise<{ principalId: string, sessionId: string, type: string }>}
 * @throws {AppError} TOKEN_EXPIRED (client should refresh) or TOKEN_INVALID
 */
export async function verifyAccessToken(token, type) {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: policyFor(type).audience,
      clockTolerance: 5,
    });
    if (
      payload.typ !== type ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      throw tokenError(ERROR_CODES.TOKEN_INVALID, 'Invalid access token');
    }
    return { principalId: payload.sub, sessionId: payload.sid, type };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof joseErrors.JWTExpired)
      throw tokenError(ERROR_CODES.TOKEN_EXPIRED, 'Access token expired');
    throw tokenError(ERROR_CODES.TOKEN_INVALID, 'Invalid access token');
  }
}

/** @param {string} sessionId */
export function newRefreshToken(sessionId) {
  const secret = randomToken(32);
  return { token: `${sessionId}.${secret}`, hash: sha256(secret) };
}

const REFRESH_RE = /^([a-f\d]{24})\.([\w-]{43})$/;

/**
 * @param {unknown} token
 * @returns {{ sessionId: string, hash: string } | null}
 */
export function parseRefreshToken(token) {
  const m = typeof token === 'string' ? REFRESH_RE.exec(token) : null;
  return m ? { sessionId: m[1], hash: sha256(m[2]) } : null;
}

/** One-time token for email links. */
export function newOneTimeToken() {
  const token = randomToken(32);
  return { token, hash: sha256(token) };
}

export const hashOneTimeToken = (token) => sha256(token);
