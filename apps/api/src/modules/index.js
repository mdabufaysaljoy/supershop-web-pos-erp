import {
  createAccountSchemas,
  createAuthSchemas,
  createRbacSchemas,
  PRINCIPAL_TYPES,
} from '@supershop/shared';
import { setAccessResolver } from '../middleware/authorize.js';
import { createAuditRouter, registerAuditSubscribers } from './audit/index.js';
import {
  AUTH_BASE_PATH,
  AUTH_TIME,
  createAuthRouter,
  registerAuthSubscribers,
  registerPrincipal,
  setAuthPolicyProvider,
  setOAuthSettingsProvider,
} from './auth/index.js';
import { createAccountRouter, createCustomerRouter, customerPrincipal } from './customers/index.js';
import { createCartRouter } from './cart/index.js';
import {
  createAccountOrdersRouter,
  createCheckoutRouter,
  registerOrderSubscribers,
} from './orders/index.js';
import { createBranchRouter, findUnknownBranches, registerBranchUsage } from './branches/index.js';
import { createBrandRouter, setBrandUsageCounter } from './brands/index.js';
import { createCategoryRouter, setCategoryUsageCounter } from './categories/index.js';
import { createCustomFieldRouter } from './customFields/index.js';
import { createI18nAdminRouter, registerI18nSubscribers } from './i18n/index.js';
import {
  countStockRecordsInBranch,
  createInventoryRouter,
  getOnlineInStock,
} from './inventory/index.js';
import { createMediaRouter } from './media/index.js';
import { createProductTransferRouter } from './productTransfer/index.js';
import {
  countPurchaseOrdersInBranch,
  countPurchaseOrdersOfSupplier,
  createPurchaseOrderRouter,
} from './purchasing/index.js';
import { createSearchRouter, registerSearchSubscribers } from './search/index.js';
import {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProductRouter,
  setAvailabilityProvider,
} from './products/index.js';
import { createRoleRouter, setRoleUsageCounter } from './rbac/index.js';
import { createSettingsRouter, getSecretSetting, getSetting } from './settings/index.js';
import { createSupplierRouter, setSupplierUsageCounter } from './suppliers/index.js';
import {
  countStaffWithRole,
  createStaffRouter,
  resolveStaffAccess,
  setBranchValidator,
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
const getAccountSchemas = memoBySettings(SCHEMA_SETTING_KEYS, () =>
  createAccountSchemas(schemaInputs()),
);

/** Identity-provider credentials for the auth module (keeps auth → settings one-way, D-023). */
const oauthSettings = (provider) => ({
  enabled: getSetting(`auth.${provider}.enabled`),
  clientId: getSetting(`auth.${provider}.clientId`),
  clientSecret: getSecretSetting(`auth.${provider}.clientSecret`) ?? '',
});

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
  setBranchValidator(findUnknownBranches); // staff can only be assigned to existing branches
  setOAuthSettingsProvider(oauthSettings);
  registerAuthSubscribers();
  // A proven email (verification link or identity provider) adopts that person's guest orders.
  registerOrderSubscribers({
    resolveCustomerEmail: async (id) => (await customerPrincipal.findById(id))?.email ?? null,
  });
  registerAuditSubscribers();
  registerI18nSubscribers();
  registerSearchSubscribers();
  // Catalog items can't be deleted while products reference them.
  setCategoryUsageCounter(countProductsInCategory);
  setBrandUsageCounter(countProductsOfBrand);
  setSupplierUsageCounter(
    async (id) => (await countProductsOfSupplier(id)) + (await countPurchaseOrdersOfSupplier(id)),
  );
  // Branches with stock or purchasing history stay.
  registerBranchUsage(countStockRecordsInBranch);
  registerBranchUsage(countPurchaseOrdersInBranch);
  setAvailabilityProvider(getOnlineInStock); // storefront in/out of stock
}

/** @param {import('express').Router} api router mounted at /api/v1 */
export function mountModuleRoutes(api) {
  registerModules();
  const authPath = AUTH_BASE_PATH.replace('/api/v1', '');
  for (const type of [PRINCIPAL_TYPES.STAFF, PRINCIPAL_TYPES.CUSTOMER]) {
    api.use(`${authPath}/${type}`, createAuthRouter(type, { getSchemas: getAuthSchemas }));
  }
  api.use('/customers', createCustomerRouter({ getSchemas: getAuthSchemas }));
  // More specific first: `/account/orders` belongs to the orders module, the rest to customers.
  api.use('/account/orders', createAccountOrdersRouter());
  api.use('/account', createAccountRouter({ getSchemas: getAccountSchemas }));
  api.use('/roles', createRoleRouter());
  api.use('/staff', createStaffRouter({ getSchemas: getRbacSchemas }));
  api.use('/branches', createBranchRouter());
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
  api.use('/search', createSearchRouter());
  api.use('/cart', createCartRouter());
  api.use('/checkout', createCheckoutRouter());
  api.use('/inventory', createInventoryRouter());
  api.use('/purchase-orders', createPurchaseOrderRouter());
}
