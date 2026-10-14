/**
 * @supershop/shared — contracts used by api, admin and storefront (CLAUDE.md §3.5: change once).
 * Rule: framework-free (no express/mongoose/react) so every app can import it.
 * Subpath imports (`@supershop/shared/money`, `/validators`, …) are available for smaller bundles.
 */
export { ERROR_CODES } from './errorCodes.js';
export * from './constants.js';
export * from './digits.js';
export * from './money.js';
export * from './permissions.js';
export * from './events.js';
export * from './trackingEvents.js';
export * as validators from './validators/index.js';
export { ACCOUNT, createAccountSchemas } from './schemas/account.js';
export { createSiteSchemas, SITE } from './schemas/site.js';
export { createPosSchemas } from './schemas/pos.js';
export { discountAmount, POS, priceSale, tenderSummary } from './pos/sale.js';
export { collectItemTexts, itemHref, MENU, resolveMenu, walkItems } from './site/menu.js';
export { isHexColor, THEME, themeCssVars } from './site/theme.js';
export {
  matchRedirect,
  normalizeRedirectPath,
  REDIRECT_STATUSES,
  robotsPolicy,
  robotsTxt,
  splitLangPrefix,
} from './site/redirects.js';
export { syncTextEntries } from './i18n/textList.js';
export { createAuthSchemas } from './schemas/auth.js';
export {
  ACTORS,
  allowedTransitions,
  countsAsSold,
  findTransition,
  isTerminal,
  ORDER_FLOW,
  ORDER_STATES,
  restocksOn,
  transitionByAction,
} from './stateMachines/order.js';
export {
  FEATURE_ICONS,
  blockEditors,
  blockPalette,
  blockTypes,
  defineBlock,
  getBlock,
  listBlocks,
} from './blocks/registry.js';
export {
  collectTexts,
  countBlocks,
  localizeBlocks,
  migratePageContent,
  PAGE_LIMITS,
  PAGE_SCHEMA_VERSION,
  pageContentSchema,
  syncTexts,
  textKey,
  walkBlocks,
} from './blocks/page.js';
export { createNotificationSchemas, NOTIFICATION } from './schemas/notification.js';
export { createPageSchemas, PAGE } from './schemas/page.js';
export { createPaymentSchemas, PAYMENT } from './schemas/payment.js';
export {
  createPaymentMethodSchemas,
  feeSchema,
  PAYMENT_METHOD,
  paymentFee,
} from './schemas/paymentMethod.js';
export { createRbacSchemas } from './schemas/rbac.js';
export { SETTINGS, SETTING_GROUPS } from './settings/definitions.js';
export { ApiError, buildApiUrl, createApiClient } from './api/client.js';
export {
  hasTranslation,
  interpolationVars,
  localizedInput,
  resolveLocalized,
  sameInterpolations,
} from './i18n/localized.js';
export { createFormatters } from './format.js';
export * from './barcode.js';
export { createProductTransferSchemas, PRODUCT_TRANSFER } from './schemas/productTransfer.js';
export { createSearchSchemas, SEARCH } from './schemas/search.js';
export { BRANCH, createBranchSchemas } from './schemas/branch.js';
export { CART, createCartSchemas } from './schemas/cart.js';
export {
  createCheckoutSchemas,
  ORDER,
  orderTotals,
  shippingAddressSchema,
  trackingTimeline,
} from './schemas/order.js';
export {
  deliveryCharge,
  paymentCharge,
  priceLines,
  TAX_CATEGORIES,
  vatRateFor,
} from './pricing.js';
export { createInventorySchemas, STOCK } from './schemas/inventory.js';
export {
  createPurchaseOrderSchemas,
  nextUnitCost,
  PURCHASE,
  PURCHASE_TRANSITIONS,
  purchaseTotals,
} from './schemas/purchaseOrder.js';
export { createI18nSchemas } from './schemas/i18n.js';
export { createMediaSchemas, MEDIA } from './schemas/media.js';
export { CATEGORY, createCategorySchemas } from './schemas/category.js';
export { BRAND, createBrandSchemas } from './schemas/brand.js';
export { createSupplierSchemas, SUPPLIER } from './schemas/supplier.js';
export {
  createCustomFieldSchemas,
  CUSTOM_FIELD,
  customFieldDefIssues,
  customValuesSchema,
} from './schemas/customField.js';
export {
  createProductSchemas,
  deriveOptionKeys,
  PRODUCT,
  productAggregateIssues,
  variantOptionsKey,
} from './schemas/product.js';
