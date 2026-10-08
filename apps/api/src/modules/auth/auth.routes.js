import express from 'express';
import { createAuthSchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { requireCsrfProtection } from '../../middleware/csrf.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

/**
 * Routes for one principal type, mounted at `/api/v1/auth/<type>`.
 * Created per app instance so rate-limit state is not shared between test apps.
 *
 *  POST /login               public, rate-limited (all attempts per IP; FAILED attempts per
 *                            IP+identifier), fail-closed
 *  POST /refresh             refresh cookie + CSRF header/origin
 *  POST /logout              refresh cookie + CSRF header/origin
 *  POST /logout-all          bearer
 *  GET  /me                  bearer
 *  POST /password/forgot     public, rate-limited, always 202
 *  POST /password/reset      public (one-time token), rate-limited
 *  POST /password/change     bearer, rate-limited
 *  POST /email/verify        customer only, public (one-time token)
 *  POST /email/resend        customer only, bearer
 *
 * @param {'staff' | 'customer'} type
 * @param {{ getSchemas?: () => ReturnType<typeof createAuthSchemas> }} [opts] returns schemas for the
 *   CURRENT settings (password policy, phone rules); called per request, memoized by the caller.
 */
const defaultSchemas = createAuthSchemas();

export function createAuthRouter(type, { getSchemas = () => defaultSchemas } = {}) {
  const r = express.Router();
  const auth = requireAuth(type);
  const csrf = requireCsrfProtection();
  const limiter = (name, limits, extra) =>
    createRateLimiter({ name: `${type}-${name}`, ...limits, failClosed: true, ...extra });

  const loginLimits = [
    limiter('login-ip', LIMITS.loginIp),
    limiter('login', LIMITS.login, {
      key: (req) => req.body?.email ?? req.body?.identifier,
      onlyFailures: true,
    }),
  ];
  const resetLimit = limiter('password-reset', LIMITS.passwordReset);
  const sensitiveLimit = limiter('sensitive', LIMITS.sensitive);

  r.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const body = (name) => validate({ body: () => getSchemas()[name] });
  const loginSchema = type === PRINCIPAL_TYPES.STAFF ? 'staffLogin' : 'customerLogin';
  r.post('/login', ...loginLimits, body(loginSchema), c.login(type));
  r.post('/refresh', limiter('refresh', LIMITS.refresh), csrf, c.refresh(type));
  r.post('/logout', csrf, c.logout(type));
  r.post('/logout-all', auth, c.logoutAll(type));
  r.get('/me', auth, c.me(type));

  r.post('/password/forgot', resetLimit, body('forgotPassword'), c.forgotPassword(type));
  r.post('/password/reset', resetLimit, body('resetPassword'), c.resetPassword(type));
  r.post('/password/change', auth, sensitiveLimit, body('changePassword'), c.changePassword(type));

  if (type === PRINCIPAL_TYPES.CUSTOMER) {
    r.post('/email/verify', sensitiveLimit, body('verifyEmail'), c.verifyEmail(type));
    r.post('/email/resend', auth, sensitiveLimit, c.resendVerification(type));
  }
  return r;
}
