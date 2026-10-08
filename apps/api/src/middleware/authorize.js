import { ERROR_CODES, EVENTS, isPermission, PRINCIPAL_TYPES } from '@supershop/shared';
import { AppError, ForbiddenError } from '../core/errors.js';
import { eventBus } from '../core/events.js';
import { requireAuth } from '../modules/auth/index.js';

/**
 * Staff authorization (CLAUDE.md §5.2). Deny by default.
 *
 *   router.get('/', requirePermission(PERMISSIONS.STAFF_VIEW), handler)
 *
 * = authenticate staff (valid token + live session) → resolve access context → check permission(s).
 * Sets `req.access` (see core/access.js). Branch checks happen in services via `actor.assertBranch`
 * / `actor.branchFilter`, because the branch usually comes from the data, not the URL.
 *
 * The resolver (staffId → AccessContext | null) is injected at the composition root so this file
 * depends on no feature module except auth.
 */

/** @type {((staffId: string) => Promise<import('../core/access.js').AccessContext | null>) | null} */
let resolveAccess = null;

/** Called once from modules/index.js. */
export function setAccessResolver(fn) {
  resolveAccess = fn;
}

const authenticateStaff = requireAuth(PRINCIPAL_TYPES.STAFF);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function loadAccess(req) {
  if (req.access) return req.access;
  if (!resolveAccess) throw new Error('Access resolver not configured');
  const access = await resolveAccess(req.auth.principalId);
  // Disabled/deleted staff: sessions are revoked on disable, this is the belt-and-braces check.
  if (!access)
    throw new AppError(ERROR_CODES.ACCOUNT_DISABLED, 'Account disabled', { status: 403 });
  req.access = access;
  return access;
}

function assertKnown(keys) {
  for (const k of keys) {
    // Fail at startup on typos — a misspelled key would otherwise deny (or worse, be ignored).
    if (!isPermission(k))
      throw new Error(`Unknown permission "${k}" — add it to @supershop/shared`);
  }
}

function makeGuard(keys, mode) {
  assertKnown(keys);
  async function authorize(req, _res, next) {
    const access = await loadAccess(req);
    const ok = mode === 'all' ? keys.every(access.can) : keys.some(access.can);
    if (!ok)
      throw new ForbiddenError(`Missing permission ${keys.join(mode === 'all' ? ' + ' : ' | ')}`);

    if (access.isSuperAdmin && !SAFE_METHODS.has(req.method)) {
      // Super-admin bypass is explicit AND audited: the audit module (P0.6) records this event.
      void eventBus.emit(
        EVENTS.ACCESS_SUPER_ADMIN_USED,
        {
          staffId: access.staffId,
          method: req.method,
          path: req.baseUrl + req.path,
          permissions: keys,
        },
        { requestId: req.id === undefined ? undefined : String(req.id) },
      );
    }
    next();
  }
  return [authenticateStaff, authorize];
}

/** Requires ALL listed permissions. */
export const requirePermission = (...keys) => makeGuard(keys, 'all');

/** Requires AT LEAST ONE of the listed permissions. */
export const requireAnyPermission = (...keys) => makeGuard(keys, 'any');

/** Any authenticated, active staff member (no specific permission), with `req.access` loaded. */
export const requireStaff = () => [
  authenticateStaff,
  async (req, _res, next) => {
    await loadAccess(req);
    next();
  },
];
