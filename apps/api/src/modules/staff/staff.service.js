import { ERROR_CODES, EVENTS, PRINCIPAL_TYPES } from '@supershop/shared';
import { createAccessContext } from '../../core/access.js';
import { nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { revokeAllSessions, setPassword } from '../auth/index.js';
import { getRoleAccess } from '../rbac/index.js';
import * as repo from './staff.repo.js';

const TYPE = PRINCIPAL_TYPES.STAFF;

/** Safe-to-return staff profile (no internal fields). */
export const toStaffProfile = (s) => ({
  id: String(s._id),
  name: s.name,
  email: s.email,
  phone: s.phone,
  status: s.status,
  roleId: s.roleId ? String(s.roleId) : null,
  branchIds: (s.branchIds ?? []).map(String),
  isSuperAdmin: Boolean(s.isSuperAdmin),
  createdAt: s.createdAt,
});

const toRef = (s) => (s ? { id: String(s._id), status: s.status, email: s.email } : null);

const forbidden = (code, message) => new AppError(code, message, { status: 403 });
const escalation = () =>
  forbidden(ERROR_CODES.PERMISSION_ESCALATION, 'Cannot grant access you do not hold');
const emit = (name, payload, actor) =>
  void eventBus.emit(name, { ...payload, actorId: actor?.staffId ?? null });

// ---------------------------------------------------------------- access resolution

/**
 * Builds the AccessContext for a staff id, or null when the staff member is missing/disabled.
 * Registered as the authorize middleware's resolver (modules/index.js).
 */
export async function resolveStaffAccess(staffId) {
  const s = await repo.findStaffById(staffId);
  if (!s || s.status !== 'active') return null;
  const role = s.isSuperAdmin ? null : await getRoleAccess(s.roleId);
  return createAccessContext({
    staffId: String(s._id),
    isSuperAdmin: Boolean(s.isSuperAdmin),
    roleId: s.roleId ? String(s.roleId) : null,
    permissions: role?.permissions ?? [],
    allBranches: role?.allBranches ?? false,
    branchIds: (s.branchIds ?? []).map(String),
  });
}

/** What the admin app needs to render `can()` and branch pickers. */
export const describeAccess = (access) => ({
  staffId: access.staffId,
  isSuperAdmin: access.isSuperAdmin,
  roleId: access.roleId,
  permissions: access.permissions,
  allBranches: access.allBranches,
  branchIds: access.branchIds,
});

// ---------------------------------------------------------------- guards

/** The actor may only touch staff within their reach. Super-admin targets: super-admins only. */
function assertCanManage(actor, target) {
  if (target.isSuperAdmin && !actor.isSuperAdmin) throw escalation();
  if (!actor.allBranches) {
    const shared = (target.branchIds ?? []).some((b) => actor.canAccessBranch(b));
    if (!shared)
      throw forbidden(ERROR_CODES.BRANCH_SCOPE_DENIED, 'Staff member is outside your branches');
  }
}

/** Assigning a role/branches/super-admin may not exceed what the actor holds. */
async function assertCanAssign(actor, { roleId, branchIds, isSuperAdmin }) {
  if (isSuperAdmin && !actor.isSuperAdmin) throw escalation();
  if (roleId) {
    const role = await getRoleAccess(roleId);
    if (!role) throw new BadRequestError('Unknown role', [{ path: 'roleId', code: 'not_found' }]);
    if (!actor.holdsAll(role.permissions) || (role.allBranches && !actor.allBranches))
      throw escalation();
  }
  if (branchIds && !actor.coversBranches(branchIds)) {
    throw forbidden(ERROR_CODES.BRANCH_SCOPE_DENIED, 'Branch not in your scope');
  }
}

async function assertNotLastSuperAdmin(target, session) {
  // Both concurrent demotions write this same guard doc → Mongo write conflict → one transaction
  // retries and recounts. Prevents write-skew removing the last two super-admins at once.
  await nextSequence('guard:super-admin', { session });
  if (
    target.isSuperAdmin &&
    target.status === 'active' &&
    (await repo.countActiveSuperAdmins({ session })) <= 1
  ) {
    throw new AppError(
      ERROR_CODES.LAST_SUPER_ADMIN,
      'At least one active super-admin is required',
      { status: 409 },
    );
  }
}

async function loadTarget(id) {
  const target = await repo.findStaffById(id);
  if (!target) throw new NotFoundError('Staff member not found');
  return target;
}

async function assertEmailFree(email, exceptId) {
  const clash = await repo.findStaffByEmail(email);
  if (clash && String(clash._id) !== String(exceptId)) {
    throw new ConflictError('Email already in use', { fields: ['email'] });
  }
}

// ---------------------------------------------------------------- use cases

/**
 * Creates a staff member with a password (atomic). `actor` = null only for the seed/CLI.
 * @param {import('../../core/access.js').AccessContext | null} actor
 */
export async function createStaff(actor, { password, ...data }) {
  if (actor) await assertCanAssign(actor, data);
  await assertEmailFree(data.email);
  const staff = await withTransaction(async (session) => {
    const doc = await repo.createStaff(data, { session });
    await setPassword(TYPE, doc._id, password, { session });
    return doc;
  });
  emit(EVENTS.STAFF_CREATED, { staffId: String(staff._id), after: toStaffProfile(staff) }, actor);
  return toStaffProfile(staff);
}

export async function listStaff(actor, query) {
  const { items, total } = await repo.listStaff({
    ...query,
    scopeBranchIds: actor.allBranches ? null : actor.branchIds,
  });
  return {
    items: items.map(toStaffProfile),
    meta: { page: query.page, limit: query.limit, total },
  };
}

export async function getStaff(actor, id) {
  const target = await loadTarget(id);
  if (String(target._id) !== actor.staffId) assertCanManage(actor, target);
  return toStaffProfile(target);
}

const SELF_LOCKED_FIELDS = ['roleId', 'status', 'branchIds', 'isSuperAdmin'];

export async function updateStaff(actor, id, patch) {
  const target = await loadTarget(id);
  const isSelf = String(target._id) === actor.staffId;
  if (isSelf && SELF_LOCKED_FIELDS.some((f) => f in patch)) {
    throw forbidden(ERROR_CODES.CANNOT_MODIFY_SELF, 'Cannot change your own access');
  }
  if (!isSelf) assertCanManage(actor, target);
  await assertCanAssign(actor, patch);
  if (patch.email) await assertEmailFree(patch.email, id);

  const demotes = patch.isSuperAdmin === false || patch.status === 'disabled';
  const after = await withTransaction(async (session) => {
    if (demotes) await assertNotLastSuperAdmin(target, session);
    return repo.updateStaff(id, patch, { session });
  });

  if (patch.status === 'disabled' && target.status !== 'disabled') {
    await revokeAllSessions(TYPE, String(id), 'staff_disabled');
    emit(EVENTS.STAFF_DISABLED, { staffId: String(id) }, actor);
  }
  emit(
    EVENTS.STAFF_UPDATED,
    { staffId: String(id), before: toStaffProfile(target), after: toStaffProfile(after) },
    actor,
  );
  return toStaffProfile(after);
}

/** Soft delete: keeps the record (history references it), frees + anonymizes the email, revokes sessions. */
export async function deleteStaff(actor, id) {
  const target = await loadTarget(id);
  if (String(target._id) === actor.staffId) {
    throw forbidden(ERROR_CODES.CANNOT_MODIFY_SELF, 'Cannot delete yourself');
  }
  assertCanManage(actor, target);
  await withTransaction(async (session) => {
    await assertNotLastSuperAdmin(target, session);
    await repo.updateStaff(
      id,
      {
        deletedAt: new Date(),
        status: 'disabled',
        email: `deleted+${id}@invalid.local`,
        phone: null,
      },
      { session },
    );
  });
  await revokeAllSessions(TYPE, String(id), 'staff_deleted');
  emit(EVENTS.STAFF_DELETED, { staffId: String(id), before: toStaffProfile(target) }, actor);
}

export async function revokeStaffSessions(actor, id) {
  const target = await loadTarget(id);
  if (String(target._id) !== actor.staffId) assertCanManage(actor, target);
  return revokeAllSessions(TYPE, String(id), 'admin_revoked');
}

export const countStaffWithRole = (roleId) => repo.countStaffWithRole(roleId);

/**
 * Seed helper: creates the first super-admin only if none exists (idempotent).
 * @returns {Promise<{ created: boolean, staff?: object }>}
 */
export async function ensureSuperAdmin({ name, email, password }) {
  if (await repo.findAnySuperAdmin()) return { created: false };
  const staff = await createStaff(null, {
    name,
    email,
    password,
    isSuperAdmin: true,
    roleId: null,
    branchIds: [],
  });
  return { created: true, staff };
}

// ---------------------------------------------------------------- auth adapter

/** @type {import('../auth/principals.js').PrincipalAdapter} */
export const staffPrincipal = {
  findByLoginIdentifier: async (email) =>
    toRef(await repo.findStaffByEmail(String(email).trim().toLowerCase())),
  findByEmail: async (email) => toRef(await repo.findStaffByEmail(email)),
  findById: async (id) => toRef(await repo.findStaffById(id)),
  getProfile: async (id) => {
    const s = await repo.findStaffById(id);
    return s ? toStaffProfile(s) : null;
  },
};
