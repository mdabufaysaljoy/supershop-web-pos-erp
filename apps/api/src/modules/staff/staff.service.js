import { EVENTS, PRINCIPAL_TYPES } from '@supershop/shared';
import { withTransaction } from '../../core/db.js';
import { eventBus } from '../../core/events.js';
import { setPassword } from '../auth/index.js';
import * as repo from './staff.repo.js';

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
});

const toRef = (s) => (s ? { id: String(s._id), status: s.status, email: s.email } : null);

/**
 * Creates a staff member with a password (atomic). Input must already be validated.
 * Used by the seed (P0.5) and the staff admin API (P0.5).
 */
export async function createStaff({ password, ...data }) {
  const staff = await withTransaction(async (session) => {
    const doc = await repo.createStaff(data, { session });
    await setPassword(PRINCIPAL_TYPES.STAFF, doc._id, password, { session });
    return doc;
  });
  void eventBus.emit(EVENTS.STAFF_CREATED, { staffId: String(staff._id) });
  return toStaffProfile(staff);
}

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
