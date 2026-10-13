import { CSRF_HEADER, ERROR_CODES } from '@supershop/shared';
import { config } from '../core/config.js';
import { AppError } from '../core/errors.js';

/**
 * CSRF guard for COOKIE-authenticated endpoints (token refresh, logout) — CLAUDE.md §5.1.
 * Bearer-token endpoints are not CSRF-prone (browsers never attach the header automatically).
 *
 * Layers (any failure → 403 CSRF_FAILED):
 * 1. Refresh cookie is SameSite=Strict (set by the auth module).
 * 2. Origin (or Referer) must be in the CORS allowlist.
 * 3. A custom header must be present — cross-site pages can't send it without a CORS preflight,
 *    which the allowlist rejects.
 *
 * @param {{ allowedOrigins?: readonly string[] }} [opts]
 */
export function requireCsrfProtection({ allowedOrigins = config.CORS_ORIGINS } = {}) {
  const allowed = new Set(allowedOrigins);
  return function csrfGuard(req, _res, next) {
    const fail = () =>
      next(new AppError(ERROR_CODES.CSRF_FAILED, 'CSRF check failed', { status: 403 }));
    if (req.get(CSRF_HEADER) !== '1') return fail();

    let origin = req.get('origin');
    if (!origin) {
      const referer = req.get('referer');
      try {
        origin = referer ? new URL(referer).origin : undefined;
      } catch {
        origin = undefined;
      }
    }
    if (!origin || !allowed.has(origin)) return fail();
    next();
  };
}
