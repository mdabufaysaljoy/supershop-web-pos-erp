/** Staff module — public API. */
export { createStaffRouter } from './staff.routes.js';
export {
  countStaffInBranch,
  countStaffPerBranch,
  countStaffWithRole,
  createStaff,
  getStaff,
  listBranchStaff,
  ensureSuperAdmin,
  resolveStaffAccess,
  setBranchValidator,
  staffPrincipal,
  toStaffProfile,
  updateStaff,
} from './staff.service.js';
