import { BRANCH, ERROR_CODES, EVENTS, SOURCE_LANGUAGE } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey } from '../../core/slug.js';
import { resolveDoc } from '../i18n/index.js';
import {
  countStaffInBranch,
  countStaffPerBranch,
  getStaff,
  listBranchStaff,
  updateStaff,
} from '../staff/index.js';
import * as repo from './branch.repo.js';

/**
 * Branches (P2.1). Scope rules: staff whose role covers all branches (HQ) see and create
 * branches; branch-scoped staff see and edit only their own branches. Staff assignment goes
 * through the staff module so its escalation/self-edit guards apply unchanged.
 */

const notFound = () => new NotFoundError('Branch not found');
const codeTaken = () =>
  new ConflictError('Branch code already used', [{ path: 'code', message: V.DUPLICATE }]);
const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor?.staffId ?? null });
const auditView = (b) => ({
  code: b.code,
  name: b.name?.en ?? '',
  type: b.type,
  isActive: b.isActive,
  fulfillsOnlineOrders: b.fulfillsOnlineOrders,
  pickupEnabled: b.pickupEnabled,
});
const ADDRESS_KEYS = [
  'buildingNumber',
  'street',
  'district',
  'city',
  'postalCode',
  'additionalNumber',
  'shortAddress',
];
const cleanAddress = (a = {}) => Object.fromEntries(ADDRESS_KEYS.map((k) => [k, a?.[k] ?? null]));

/** Other usages that block deletion (stock, orders, shifts…) — registered by later modules. */
const usageCounters = [];
export function registerBranchUsage(fn) {
  usageCounters.push(fn);
}

export const toBranchDto = (b, staffCount) => ({
  id: String(b._id),
  code: b.code,
  name: b.name ?? { en: '' },
  type: b.type,
  address: cleanAddress(b.address),
  phone: b.phone ?? null,
  email: b.email ?? null,
  location: b.location?.lat != null ? { lat: b.location.lat, lng: b.location.lng } : null,
  isActive: b.isActive,
  fulfillsOnlineOrders: b.fulfillsOnlineOrders,
  pickupEnabled: b.pickupEnabled,
  ...(staffCount !== undefined && { staffCount }),
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

function assertHq(actor) {
  if (!actor.allBranches) {
    throw new AppError(
      ERROR_CODES.BRANCH_SCOPE_DENIED,
      'Only staff covering all branches can do this',
      { status: 403 },
    );
  }
}

async function loadInScope(actor, id) {
  const b = await repo.findActiveById(id);
  if (!b || !actor.canAccessBranch(id)) throw notFound(); // out of scope looks like "not found"
  return b;
}

export async function listBranches(actor) {
  const [branches, counts] = await Promise.all([
    repo.listBranches(actor.allBranches ? null : actor.branchIds),
    countStaffPerBranch(),
  ]);
  return branches.map((b) => toBranchDto(b, counts.get(String(b._id)) ?? 0));
}

export async function getBranch(actor, id) {
  const b = await loadInScope(actor, id);
  return toBranchDto(b, await countStaffInBranch(id));
}

/** For other modules: ids that are not existing (non-deleted) branches. */
export async function findUnknownBranches(ids) {
  const found = new Set((await repo.findActiveByIds(ids)).map((b) => String(b._id)));
  return ids.filter((id) => !found.has(String(id)));
}

export async function createBranch(actor, input) {
  assertHq(actor);
  // The list is unpaginated (pickers, scope menus), so the number of branches is capped.
  if ((await repo.countActive()) >= BRANCH.MAX_BRANCHES) {
    throw new ValidationError([{ path: 'code', message: V.TOO_LONG }]);
  }
  if (await repo.codeExists(input.code)) throw codeTaken();
  let created;
  try {
    created = await repo.createBranch({
      code: input.code,
      name: { [SOURCE_LANGUAGE]: input.name },
      type: input.type,
      address: cleanAddress(input.address),
      phone: input.phone ?? null,
      email: input.email ?? null,
      location: input.location ?? null,
      isActive: input.isActive ?? true,
      fulfillsOnlineOrders: input.fulfillsOnlineOrders ?? false,
      pickupEnabled: input.pickupEnabled ?? false,
    });
  } catch (err) {
    throw isDuplicateKey(err, 'code') ? codeTaken() : err;
  }
  emit(actor, EVENTS.BRANCH_CREATED, { branchId: String(created._id), after: auditView(created) });
  return toBranchDto(created, 0);
}

export async function updateBranch(actor, id, input) {
  await loadInScope(actor, id);
  const doc = await repo.loadForUpdate(id);
  if (!doc) throw notFound();
  if (
    input.code !== undefined &&
    input.code !== doc.code &&
    (await repo.codeExists(input.code, id))
  )
    throw codeTaken();
  const before = auditView(doc.toObject());
  if (input.name !== undefined) doc.set(`name.${SOURCE_LANGUAGE}`, input.name);
  if (input.address !== undefined)
    doc.address = cleanAddress({ ...doc.toObject().address, ...input.address });
  for (const k of [
    'code',
    'type',
    'phone',
    'email',
    'location',
    'isActive',
    'fulfillsOnlineOrders',
    'pickupEnabled',
  ]) {
    if (input[k] !== undefined) doc.set(k, input[k]);
  }
  let saved;
  try {
    saved = await repo.saveDoc(doc);
  } catch (err) {
    throw isDuplicateKey(err, 'code') ? codeTaken() : err;
  }
  emit(actor, EVENTS.BRANCH_UPDATED, { branchId: id, before, after: auditView(saved) });
  return toBranchDto(saved, await countStaffInBranch(id));
}

/** Soft delete; refused while staff (or, later, stock/orders) reference the branch. */
export async function deleteBranch(actor, id) {
  assertHq(actor);
  await loadInScope(actor, id);
  const uses = [
    await countStaffInBranch(id),
    ...(await Promise.all(usageCounters.map((fn) => fn(id)))),
  ];
  if (uses.some((n) => n > 0)) {
    throw new AppError(ERROR_CODES.BRANCH_IN_USE, 'Branch is in use — deactivate it instead', {
      status: 409,
    });
  }
  if (!(await repo.softDelete(id))) throw notFound();
  emit(actor, EVENTS.BRANCH_DELETED, { branchId: id });
}

// ---------------------------------------------------------------- staff assignment

export async function branchStaff(actor, id) {
  await loadInScope(actor, id);
  return listBranchStaff(actor, id);
}

/** Adds/removes one branch on a staff member (staff-module guards: scope, escalation, self). */
async function setAssignment(actor, branchId, staffId, assigned) {
  await loadInScope(actor, branchId);
  const target = await getStaff(actor, staffId);
  const has = target.branchIds.includes(branchId);
  if (has === assigned) return target;
  const branchIds = assigned
    ? [...target.branchIds, branchId]
    : target.branchIds.filter((b) => b !== branchId);
  return updateStaff(actor, staffId, { branchIds });
}
export const assignStaff = (actor, branchId, staffId) =>
  setAssignment(actor, branchId, staffId, true);
export const unassignStaff = (actor, branchId, staffId) =>
  setAssignment(actor, branchId, staffId, false);

// ---------------------------------------------------------------- public + seed

/** Store list for the storefront (store locator, pick-up), names in `lang`. */
export async function listPublicBranches(lang) {
  return (await repo.listPublic()).map((b) => {
    const dto = toBranchDto(b);
    return {
      id: dto.id,
      code: dto.code,
      name: resolveDoc(b, ['name'], lang).name,
      address: dto.address,
      phone: dto.phone,
      location: dto.location,
      pickupEnabled: dto.pickupEnabled,
    };
  });
}

/** First run: one "Main store" so POS/inventory have a branch to work with. Idempotent. */
export async function seedMainBranch() {
  if ((await repo.countActive()) > 0) return null;
  return repo.createBranch({
    code: 'MAIN',
    name: { en: 'Main store' },
    type: 'store',
    fulfillsOnlineOrders: true,
  });
}
