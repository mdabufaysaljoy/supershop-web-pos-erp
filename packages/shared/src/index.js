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
export { createAuthSchemas } from './schemas/auth.js';
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
