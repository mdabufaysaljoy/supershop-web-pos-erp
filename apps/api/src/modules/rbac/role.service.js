import { ALL_PERMISSIONS, ERROR_CODES, EVENTS, PERMISSION_GROUPS } from '@supershop/shared';
import { AppError, ConflictError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { DEFAULT_ROLES } from './defaultRoles.js';
import * as repo from './role.repo.js';

/**
 * Role management. Every mutation takes the acting staff's AccessContext (`actor`) and enforces
 * "you can only grant what you hold" (non-super-admins), so `role.manage` alone can't escalate.
 */

export const toRoleDto = (r) => ({
  id: String(r._id),
  name: r.name,
  description: r.description,
  permissions: [...r.permissions].sort(),
  allBranches: Boolean(r.allBranches),
  isSystem: Boolean(r.isSystem),
  systemKey: r.systemKey ?? null,
  updatedAt: r.updatedAt,
});

/** Count of staff using a role — provided by the staff module at the composition root. */
let countStaffWithRole = async () => {
  throw new Error('Role usage counter not configured');
};
export function setRoleUsageCounter(fn) {
  countStaffWithRole = fn;
}

const escalation = () =>
  new AppError(ERROR_CODES.PERMISSION_ESCALATION, 'Cannot grant permissions you do not hold', {
    status: 403,
  });

function assertCanGrant(actor, { permissions, allBranches }) {
  if (permissions && !actor.holdsAll(permissions)) throw escalation();
  if (allBranches && !actor.allBranches) throw escalation();
}

const emit = (name, payload, actor) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });

export const listRoles = async () => (await repo.listRoles()).map(toRoleDto);

export async function getRole(id) {
  const r = await repo.findRoleById(id);
  if (!r) throw new NotFoundError('Role not found');
  return toRoleDto(r);
}

/** The permission registry, grouped, for the role editor UI. */
export const getPermissionCatalog = () => ({ groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS });

async function assertNameFree(name, exceptId) {
  const clash = await repo.findRoleByNameKey(repo.nameKeyOf(name));
  if (clash && String(clash._id) !== String(exceptId)) {
    throw new ConflictError('Role name already exists', { fields: ['name'] });
  }
}

export async function createRole(actor, input) {
  assertCanGrant(actor, input);
  await assertNameFree(input.name);
  const role = await repo.createRole(input);
  emit(EVENTS.ROLE_CREATED, { roleId: String(role._id), after: toRoleDto(role) }, actor);
  return toRoleDto(role);
}

export async function updateRole(actor, id, patch) {
  const before = await repo.findRoleById(id);
  if (!before) throw new NotFoundError('Role not found');
  // Editing a role that already holds more than you do would let you keep/redistribute it.
  if (!actor.holdsAll(before.permissions) || (before.allBranches && !actor.allBranches))
    throw escalation();
  // Nobody edits the role they themselves hold (self-escalation).
  if (actor.roleId === String(id) && !actor.isSuperAdmin) {
    throw new AppError(ERROR_CODES.CANNOT_MODIFY_SELF, 'Cannot change your own role', {
      status: 403,
    });
  }
  assertCanGrant(actor, patch);
  if (patch.name) await assertNameFree(patch.name, id);

  const after = await repo.updateRole(id, patch);
  emit(
    EVENTS.ROLE_UPDATED,
    { roleId: String(id), before: toRoleDto(before), after: toRoleDto(after) },
    actor,
  );
  return toRoleDto(after);
}

export async function deleteRole(actor, id) {
  const role = await repo.findRoleById(id);
  if (!role) throw new NotFoundError('Role not found');
  if (role.isSystem) {
    throw new AppError(ERROR_CODES.SYSTEM_ROLE_PROTECTED, 'Default roles cannot be deleted', {
      status: 409,
    });
  }
  if (!actor.holdsAll(role.permissions)) throw escalation();
  const inUse = await countStaffWithRole(String(id));
  if (inUse > 0) {
    throw new AppError(ERROR_CODES.ROLE_IN_USE, 'Role is assigned to staff', {
      status: 409,
      details: { staffCount: inUse },
    });
  }
  await repo.deleteRole(id);
  emit(EVENTS.ROLE_DELETED, { roleId: String(id), before: toRoleDto(role) }, actor);
}

/**
 * Access data for a role id (used by the staff module to build AccessContexts).
 * @returns {Promise<{ permissions: string[], allBranches: boolean } | null>}
 */
export async function getRoleAccess(roleId) {
  if (!roleId) return null;
  const r = await repo.findRoleById(roleId);
  return r ? { permissions: r.permissions, allBranches: Boolean(r.allBranches) } : null;
}

/** Idempotent: inserts missing default roles; never overwrites admin edits. */
export async function seedDefaultRoles() {
  for (const role of DEFAULT_ROLES) await repo.insertSystemRoleIfMissing({ ...role });
  return DEFAULT_ROLES.length;
}

/** @param {string} systemKey */
export async function findSystemRoleId(systemKey) {
  const r = await repo.findRoleBySystemKey(systemKey);
  return r ? String(r._id) : null;
}
