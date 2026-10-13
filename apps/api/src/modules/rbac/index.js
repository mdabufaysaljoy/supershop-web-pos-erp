/** RBAC (roles) module — public API. */
export { createRoleRouter } from './role.routes.js';
export { DEFAULT_ROLES } from './defaultRoles.js';
export {
  findSystemRoleId,
  getRoleAccess,
  seedDefaultRoles,
  setRoleUsageCounter,
  toRoleDto,
} from './role.service.js';
