import { createAuthSchemas, createRbacSchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { setAccessResolver } from '../middleware/authorize.js';
import { createAuditRouter, registerAuditSubscribers } from './audit/index.js';
import {
  AUTH_BASE_PATH,
  AUTH_TIME,
  createAuthRouter,
  registerAuthSubscribers,
  registerPrincipal,
  setAuthPolicyProvider,
} from './auth/index.js';
import { createCustomerRouter, customerPrincipal } from './customers/index.js';
import { createBrandRouter, setBrandUsageCounter } from './brands/index.js';
import { createCategoryRouter, setCategoryUsageCounter } from './categories/index.js';
import { createCustomFieldRouter } from './customFields/index.js';
import { createI18nAdminRouter, registerI18nSubscribers } from './i18n/index.js';
import { createMediaRouter } from './media/index.js';
import { createProductTransferRouter } from './productTransfer/index.js';
import {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProductRouter,
} from './products/index.js';
import { createRoleRouter, setRoleUsageCounter } from './rbac/index.js';
import { createSettingsRouter, getSetting } from './settings/index.js';
import { createSupplierRouter, setSupplierUsageCounter } from './suppliers/index.js';
import {
  countStaffWithRole,
  createStaffRouter,
  resolveStaffAccess,
  staffPrincipal,
} from './staff/index.js';

/**
 * Composition root for feature modules: the ONE place that knows about every module.
 * Adding a module = register its adapters/subscribers in `registerModules` and mount its router
 * in `mountModuleRoutes`. Cross-module wiring that would otherwise create import cycles
 * (e.g. auth ← settings) is injected here.
 */

/** Rebuilds `build()` only when the settings it depends on change (frozen values → cheap key). */
function memoBySettings(keys, build) {
  let lastKey;
  let value;
  return () => {
    const key = JSON.stringify(keys.map(getSetting));
    if (key !== lastKey) {
      lastKey = key;
      value = build();
    }
    return value;
  };
}

const schemaInputs = () => ({
  passwordPolicy: getSetting('security.passwordPolicy'),
  allowInternationalPhone: getSetting('customers.allowInternationalPhone'),
});
const SCHEMA_SETTING_KEYS = ['security.passwordPolicy', 'customers.allowInternationalPhone'];
const getAuthSchemas = memoBySettings(SCHEMA_SETTING_KEYS, () => createAuthSchemas(schemaInputs()));
const getRbacSchemas = memoBySettings(SCHEMA_SETTING_KEYS, () => createRbacSchemas(schemaInputs()));

/** Admin-editable parts of the auth policy (settings group `security`). */
function authPolicyFromSettings(type) {
  const { MINUTE, HOUR, DAY } = AUTH_TIME;
  const isStaff = type === PRINCIPAL_TYPES.STAFF;
  return {
    lockout: {
      maxAttempts: getSetting('security.lockoutMaxAttempts'),
      lockMs: getSetting('security.lockoutMinutes') * MINUTE,
    },
    refreshIdleMs: isStaff
      ? getSetting('security.staffSessionIdleHours') * HOUR
      : getSetting('security.customerSessionIdleDays') * DAY,
    refreshAbsoluteMs: isStaff
      ? getSetting('security.staffSessionMaxDays') * DAY
      : getSetting('security.customerSessionMaxDays') * DAY,
  };
}

let registered = false;

/** Wires cross-module adapters and event subscribers. Idempotent (safe in tests). */
export function registerModules() {
  if (registered) return;
  registered = true;
  registerPrincipal(PRINCIPAL_TYPES.STAFF, staffPrincipal);
  registerPrincipal(PRINCIPAL_TYPES.CUSTOMER, customerPrincipal);
  setAuthPolicyProvider(authPolicyFromSettings);
  setAccessResolver(resolveStaffAccess);
  setRoleUsageCounter(countStaffWithRole);
  registerAuthSubscribers();
  registerAuditSubscribers();
  registerI18nSubscribers();
  // Catalog items can't be deleted while products reference them.
  setCategoryUsageCounter(countProductsInCategory);
  setBrandUsageCounter(countProductsOfBrand);
  setSupplierUsageCounter(countProductsOfSupplier); // + purchase orders in P2.3
}

/** @param {import('express').Router} api router mounted at /api/v1 */
export function mountModuleRoutes(api) {
  registerModules();
  const authPath = AUTH_BASE_PATH.replace('/api/v1', '');
  for (const type of [PRINCIPAL_TYPES.STAFF, PRINCIPAL_TYPES.CUSTOMER]) {
    api.use(`${authPath}/${type}`, createAuthRouter(type, { getSchemas: getAuthSchemas }));
  }
  api.use('/customers', createCustomerRouter({ getSchemas: getAuthSchemas }));
  api.use('/roles', createRoleRouter());
  api.use('/staff', createStaffRouter({ getSchemas: getRbacSchemas }));
  api.use('/settings', createSettingsRouter());
  api.use('/audit', createAuditRouter());
  api.use('/i18n', createI18nAdminRouter());
  api.use('/media', createMediaRouter());
  api.use('/categories', createCategoryRouter());
  api.use('/brands', createBrandRouter());
  api.use('/suppliers', createSupplierRouter());
  api.use('/custom-fields', createCustomFieldRouter());
  api.use('/products', createProductRouter());
  api.use('/product-transfers', createProductTransferRouter());
}
