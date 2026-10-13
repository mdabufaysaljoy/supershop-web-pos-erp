import { config } from '../../core/config.js';

/**
 * Refresh-token cookie (CLAUDE.md §5.1): httpOnly (JS can't read it), Secure in production,
 * SameSite=Strict, and path-scoped to this principal's auth routes so it is never sent anywhere
 * else. Staff and customer cookies are separate so both apps can be open in one browser.
 */
export const AUTH_BASE_PATH = '/api/v1/auth';

export const refreshCookieName = (type) => `${config.isProd ? '__Secure-' : ''}ss_rt_${type}`;

const cookieOptions = (type) => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  path: `${AUTH_BASE_PATH}/${type}`,
  ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
});

/**
 * @param {import('express').Response} res
 * @param {string} type
 * @param {string} token
 * @param {Date} expiresAt
 */
export function setRefreshCookie(res, type, token, expiresAt) {
  res.cookie(refreshCookieName(type), token, { ...cookieOptions(type), expires: expiresAt });
}

export function clearRefreshCookie(res, type) {
  res.clearCookie(refreshCookieName(type), cookieOptions(type));
}

/** @param {import('express').Request} req */
export const readRefreshCookie = (req, type) => req.cookies?.[refreshCookieName(type)];
