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
import {
  createAccountRouter,
  createCustomerRouter,
  customerPrincipal,
  findCustomerByContact,
} from './customers/index.js';
import { createCartRouter } from './cart/index.js';
import {
  createAccountOrdersRouter,
  createCheckoutRouter,
  createOrderAdminRouter,
  createPosRouter,
  getBestSellingProductIds,
  getOrderById,
  getOrderForStaff,
  listOrdersForShift,
  registerOrderSubscribers,
  setOrderShopProvider,
  setPaymentHooks,
  setPaymentMethodResolver,
  setPosCustomerLookup,
  setPosShiftResolver,
} from './orders/index.js';
import {
  createPaymentRouter,
  isGatewayReady,
  startPaymentForOrder,
  syncOrderPayment,
} from './payments/index.js';
import { createPaymentMethodRouter, resolveForCheckout } from './paymentMethods/index.js';
import {
  createBranchRouter,
  findUnknownBranches,
  getBranchSummaries,
  registerBranchUsage,
} from './branches/index.js';
import {
  createBrandRouter,
  getBrandsByIds,
  getBrandsWithLogo,
  setBrandUsageCounter,
} from './brands/index.js';
import {
  createCategoryRouter,
  getCategoriesByIds,
  listCategories,
  setCategoryUsageCounter,
} from './categories/index.js';
import { createCustomFieldRouter } from './customFields/index.js';
import { createI18nAdminRouter, registerI18nSubscribers } from './i18n/index.js';
import {
  countStockRecordsInBranch,
  createInventoryRouter,
  getOnlineInStock,
} from './inventory/index.js';
import { createMediaRouter, getMediaByIds } from './media/index.js';
import {
  createNotificationRouter,
  registerNotificationSubscribers,
} from './notifications/index.js';
import {
  buildDrawerKickJob,
  buildShiftReportJob,
  createPrintingRouter,
  setPrintingProviders,
} from './printing/index.js';
import {
  countShiftsInBranch,
  createShiftRouter,
  resolveOpenShiftForSale,
  setShiftProviders,
} from './shifts/index.js';
import { createPageRouter, getPublishedPageSlugs, setBlockDataProviders } from './pages/index.js';
import { createSiteRouter, getSiteChrome, setMenuRefProviders } from './site/index.js';
import { createProductTransferRouter } from './productTransfer/index.js';
import {
  countPurchaseOrdersInBranch,
  countPurchaseOrdersOfSupplier,
  createPurchaseOrderRouter,
} from './purchasing/index.js';
import { createSearchRouter, registerSearchSubscribers, searchProducts } from './search/index.js';
import {
  countProductsInCategory,
  countProductsOfBrand,
  countProductsOfSupplier,
  createProductRouter,
  getProductIdsByTag,
  getPublicCards,
  setAvailabilityProvider,
} from './products/index.js';
import { createRoleRouter, setRoleUsageCounter } from './rbac/index.js';
import { createSettingsRouter, getSecretSetting, getSetting } from './settings/index.js';
import { createSupplierRouter, setSupplierUsageCounter } from './suppliers/index.js';
import {
  countStaffWithRole,
  createStaffRouter,
  getStaffNames,
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
  // Orders start and refresh payments through the payments module; payments apply the outcome
  // back onto the order. Injecting one direction here keeps the imports one-way.
  setPaymentHooks({ start: startPaymentForOrder, sync: syncOrderPayment });
  // Checkout validates the chosen method against the shop's own list and gets its fee (P4.2).
  setPaymentMethodResolver((key, { total }) =>
    resolveForCheckout(key, { total, isGatewayReady: () => isGatewayReady() }),
  );
  // A sale at the counter can be attached to a customer the shop already knows (P6.1).
  setPosCustomerLookup(findCustomerByContact);
  setPosShiftResolver(resolveOpenShiftForSale);
  const getShop = async (lang) => {
    const chrome = await getSiteChrome(lang);
    return {
      name: getSetting('store.name'),
      address: chrome.contact.address,
      phone: chrome.contact.phone,
      vatNumber: getSetting('tax.vatNumber'),
    };
  };
  setOrderShopProvider(getShop);
  // What a receipt prints: the order itself, and how the shop names itself on paper (P6.3/P6.4).
  setPrintingProviders({
    getOrder: (id) => getOrderForStaff(id).catch(() => null),
    getShop,
    getMediaByIds,
  });
  setShiftProviders({
    getStaffNames,
    getBranchSummaries,
    listOrdersForShift,
    getShop,
    buildShiftReportJob,
    buildDrawerKickJob,
  });
  registerAuthSubscribers();
  // A proven email (verification link or identity provider) adopts that person's guest orders.
  registerOrderSubscribers({
    resolveCustomerEmail: async (id) => (await customerPrincipal.findById(id))?.email ?? null,
  });
  // What the shop tells its customers (P4.5). Notifications never import orders or customers.
  registerNotificationSubscribers({
    getOrder: (id) => getOrderById(id),
    getRecipient: async (type, id) =>
      type === PRINCIPAL_TYPES.STAFF
        ? ((await staffPrincipal.getProfile(id)) ?? null)
        : ((await customerPrincipal.getProfile(id)) ?? null),
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
  // Branches with stock, purchasing or shift history stay.
  registerBranchUsage(countStockRecordsInBranch);
  registerBranchUsage(countPurchaseOrdersInBranch);
  registerBranchUsage(countShiftsInBranch);
  setAvailabilityProvider(getOnlineInStock); // storefront in/out of stock
  // A page's blocks say what they want; these lookups fill them in (P5.3). Pages import no module.
  // A menu item points at a page, category or brand; these say whether it is still there (P5.4).
  setMenuRefProviders({
    page: getPublishedPageSlugs,
    category: async (ids) =>
      Object.fromEntries(
        (await getCategoriesByIds(ids)).filter((c) => c.isActive).map((c) => [c.id, c.slug]),
      ),
    brand: async (ids) =>
      Object.fromEntries(
        (await getBrandsByIds(ids)).filter((b) => b.isActive).map((b) => [b.id, b.slug]),
      ),
  });
  setBlockDataProviders({
    searchProducts,
    getProductCards: getPublicCards,
    getProductIdsByTag,
    getBestSellingProductIds,
    listCategories,
    getCategoriesByIds,
    getBrandsByIds,
    getBrandsWithLogo,
  });
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
  api.use('/pages', createPageRouter());
  api.use('/site', createSiteRouter());
  api.use('/categories', createCategoryRouter());
  api.use('/brands', createBrandRouter());
  api.use('/suppliers', createSupplierRouter());
  api.use('/custom-fields', createCustomFieldRouter());
  api.use('/products', createProductRouter());
  api.use('/product-transfers', createProductTransferRouter());
  api.use('/search', createSearchRouter());
  api.use('/cart', createCartRouter());
  api.use('/checkout', createCheckoutRouter());
  api.use('/orders', createOrderAdminRouter());
  api.use('/pos', createPosRouter());
  api.use('/shifts', createShiftRouter());
  api.use('/printing', createPrintingRouter());
  api.use('/payments', createPaymentRouter());
  api.use(
    '/payment-methods',
    createPaymentMethodRouter({ isGatewayReady: () => isGatewayReady() }),
  );
  api.use('/notifications', createNotificationRouter());
  api.use('/inventory', createInventoryRouter());
  api.use('/purchase-orders', createPurchaseOrderRouter());
}
