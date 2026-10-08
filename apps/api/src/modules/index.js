import { PRINCIPAL_TYPES } from '@supershop/shared';
import {
  AUTH_BASE_PATH,
  createAuthRouter,
  registerAuthSubscribers,
  registerPrincipal,
} from './auth/index.js';
import { setAccessResolver } from '../middleware/authorize.js';
import { createCustomerRouter, customerPrincipal } from './customers/index.js';
import { createRoleRouter, setRoleUsageCounter } from './rbac/index.js';
import {
  countStaffWithRole,
  createStaffRouter,
  resolveStaffAccess,
  staffPrincipal,
} from './staff/index.js';

/**
 * Composition root for feature modules: the ONE place that knows about every module.
 * Adding a module = register its adapters/subscribers in `registerModules` and mount its router
 * in `mountModuleRoutes`.
 */

let registered = false;

/** Wires cross-module adapters and event subscribers. Idempotent (safe in tests). */
export function registerModules() {
  if (registered) return;
  registered = true;
  registerPrincipal(PRINCIPAL_TYPES.STAFF, staffPrincipal);
  registerPrincipal(PRINCIPAL_TYPES.CUSTOMER, customerPrincipal);
  setAccessResolver(resolveStaffAccess);
  setRoleUsageCounter(countStaffWithRole);
  registerAuthSubscribers();
}

/** @param {import('express').Router} api router mounted at /api/v1 */
export function mountModuleRoutes(api) {
  registerModules();
  const authPath = AUTH_BASE_PATH.replace('/api/v1', '');
  api.use(`${authPath}/${PRINCIPAL_TYPES.STAFF}`, createAuthRouter(PRINCIPAL_TYPES.STAFF));
  api.use(`${authPath}/${PRINCIPAL_TYPES.CUSTOMER}`, createAuthRouter(PRINCIPAL_TYPES.CUSTOMER));
  api.use('/customers', createCustomerRouter());
  api.use('/roles', createRoleRouter());
  api.use('/staff', createStaffRouter());
}
