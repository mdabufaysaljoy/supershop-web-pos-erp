/** Staff module — public API. */
export { createStaffRouter } from './staff.routes.js';
export {
  countStaffWithRole,
  createStaff,
  ensureSuperAdmin,
  resolveStaffAccess,
  staffPrincipal,
  toStaffProfile,
} from './staff.service.js';
