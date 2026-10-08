import { ALL_PERMISSIONS, ERROR_CODES, isPermission } from '@supershop/shared';
import mongoose from 'mongoose';
import { AppError, ForbiddenError } from './errors.js';

/**
 * Access context of an authenticated staff member (CLAUDE.md §5.2): what they may do (permissions)
 * and where (branches). Built once per request by the authorize middleware and passed to services
 * as `actor`. Pure — no I/O — so services and tests can use it directly.
 *
 * Branch scope ("Every stock/sale/shift/report record carries branchId; queries go through scope
 * helper", CLAUDE.md §2.4): `allBranches` actors see everything; others only their assigned branches.
 */

/**
 * @typedef {object} AccessInput
 * @property {string} staffId
 * @property {boolean} [isSuperAdmin]   explicit bypass of permission AND branch checks
 * @property {Iterable<string>} [permissions]
 * @property {boolean} [allBranches]
 * @property {Iterable<string>} [branchIds]
 * @property {string | null} [roleId]
 */

const branchDenied = () =>
  new AppError(ERROR_CODES.BRANCH_SCOPE_DENIED, 'Branch not in your scope', { status: 403 });

/**
 * @param {AccessInput} input
 */
export function createAccessContext({
  staffId,
  isSuperAdmin = false,
  permissions = [],
  allBranches = false,
  branchIds = [],
  roleId = null,
}) {
  // Unknown keys (e.g. a permission removed from the registry but still stored on a role) are dropped.
  const perms = new Set([...permissions].filter(isPermission));
  const branches = new Set([...branchIds].map(String));
  const seesAllBranches = isSuperAdmin || allBranches;

  const ctx = {
    staffId: String(staffId),
    roleId: roleId ? String(roleId) : null,
    isSuperAdmin,
    allBranches: seesAllBranches,
    /** Effective permissions, sorted (super-admin → every key, so clients need no special case). */
    permissions: Object.freeze(isSuperAdmin ? [...ALL_PERMISSIONS].sort() : [...perms].sort()),
    branchIds: Object.freeze([...branches].sort()),

    /** @param {string} key */
    can: (key) => isPermission(key) && (isSuperAdmin || perms.has(key)),

    /** @param {string} key */
    assert(key) {
      if (!ctx.can(key)) throw new ForbiddenError(`Missing permission ${key}`);
    },

    /** @param {string | import('mongoose').Types.ObjectId | null | undefined} branchId */
    canAccessBranch: (branchId) =>
      seesAllBranches || (branchId != null && branches.has(String(branchId))),

    assertBranch(branchId) {
      if (!ctx.canAccessBranch(branchId)) throw branchDenied();
    },

    /**
     * Mongo filter fragment restricting a query to the actor's branches.
     * - `requested` given → asserts access and filters to that branch only.
     * - otherwise → all branches (allBranches) or `$in` the assigned ones (none assigned → matches nothing).
     * @param {string} [field]
     * @param {string | null} [requested]
     * @returns {Record<string, unknown>}
     */
    branchFilter(field = 'branchId', requested = null) {
      if (requested) {
        ctx.assertBranch(requested);
        return { [field]: toObjectId(requested) };
      }
      if (seesAllBranches) return {};
      return { [field]: { $in: [...branches].map(toObjectId) } };
    },

    /**
     * True when every permission in `keys` is held — used to stop privilege escalation
     * (you can only grant what you have).
     * @param {Iterable<string>} keys
     */
    holdsAll: (keys) => isSuperAdmin || [...keys].every((k) => perms.has(k)),

    /** True when every branch in `ids` is inside the actor's scope. */
    coversBranches: (ids) => seesAllBranches || [...ids].every((id) => branches.has(String(id))),
  };
  return Object.freeze(ctx);
}

const toObjectId = (id) =>
  mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : id;

/** @typedef {ReturnType<typeof createAccessContext>} AccessContext */
