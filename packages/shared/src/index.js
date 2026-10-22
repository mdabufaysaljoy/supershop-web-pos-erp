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
export { createShiftSchemas } from './schemas/shift.js';
export { createReturnExchangeSchemas } from './schemas/returnExchange.js';
export { createLoyaltySchemas, LOYALTY } from './schemas/loyalty.js';
export { createCustomerAdminSchemas } from './schemas/customer.js';
export { CUSTOMER_SEGMENTS, deriveCustomerSegment } from './customers/segments.js';
export { CAMPAIGN, interpolateCampaignTemplate } from './campaigns/campaigns.js';
export { createCampaignSchemas } from './schemas/campaign.js';
export {
  calculateEarnedPoints,
  calculatePointsForDiscount,
  calculateRedemptionDiscount,
  calculateReversedPoints,
  computeTier,
  isRedemptionAllowed,
} from './loyalty/loyalty.js';
export { createPrintingSchemas, PRINTING } from './schemas/printing.js';
export {
  ALIGN,
  charsForWidth,
  columns,
  encodeText,
  PAPER,
  previewLines,
  renderEscPos,
  toBase64,
  wrap,
} from './printing/escpos.js';
export { receiptUrl } from './printing/receiptUrl.js';
export {
  buildLabelTemplate,
  buildLoyaltyCardTemplate,
  buildReceiptTemplate,
  DEFAULT_LABEL_CONFIG,
  DEFAULT_LABEL_TEMPLATE,
  DEFAULT_RECEIPT_CONFIG,
  DEFAULT_RECEIPT_TEMPLATE,
  expand,
  fill,
  labelData,
  loyaltyCardData,
  RECEIPT_LANGUAGES,
  receiptData,
  renderTemplate,
  resolveReceiptLabel,
} from './printing/template.js';
export { decodeZatcaQr, formatZatcaAmount, qrMatrix, qrSvg, zatcaQr } from './printing/zatca.js';
export { QR_DEFAULT_LEVEL, QR_LEVELS } from './printing/qr.js';
export {
  addTender,
  changeIsCovered,
  discountAmount,
  POS,
  priceSale,
  tenderSummary,
} from './pos/sale.js';
export {
  buildShiftReportTemplate,
  renderShiftReport,
  SHIFT,
  shiftReportData,
  summarizeShift,
} from './pos/shift.js';
export {
  buildReturnReceiptTemplate,
  priceExchangeSettlement,
  priceReturnedLines,
  renderReturnReceipt,
  RETURN_EXCHANGE,
  returnReceiptData,
} from './pos/returnExchange.js';
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
export {
  ANALYTICS,
  calculateDeltaPercent,
  createAnalyticsSchemas,
  FORECAST,
  parseHorizonDays,
  parseLookbackDays,
  resolveAnalyticsPeriod,
  RETURNS_ANALYTICS,
} from './schemas/analytics.js';
export {
  calculateStockoutRisk,
  getForecastingStrategy,
  listForecastingStrategies,
  movingAverageStrategy,
  registerForecastingStrategy,
  seasonalityStrategy,
} from './forecasting/strategies.js';
export {
  createExportJobSchema,
  exportJobsQuerySchema,
  filterPermittedColumns,
  getAllColumns,
  getDefaultColumns,
  reportPresetSchema,
  EXPORT_FORMATS,
  EXPORT_RESOURCES,
  RESOURCE_COLUMNS,
} from './schemas/export.js';
export {
  attributionSchema,
  buildDataLayerPayload,
  buildEcomItem,
  consentSettingsSchema,
  generateEventId,
  updateTrackingIntegrationSchema,
  CONSENT_CATEGORIES,
  CONSENT_COOKIE_NAME,
  PROVIDER_CONFIG_SCHEMAS,
  TRACKING_PROVIDERS,
  TRACKING_LOG_STATUS,
  META_EVENT_MAP,
  normalizePhoneForTracking,
  trackingLogQuerySchema,
  trackingLogIdParamSchema,
  testEventSchema,
  serverEventIngestSchema,
} from './schemas/tracking.js';
