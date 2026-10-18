import { z } from 'zod';
import { TRACKING_EVENTS } from '../trackingEvents.js';
import { V } from '../validators/messages.js';
import { httpUrl, objectId, plainText } from '../validators/fields.js';

export const trackingLogIdParamSchema = z.object({
  id: objectId,
});

export const TRACKING_PROVIDERS = Object.freeze([
  'gtm',
  'ga4',
  'meta',
  'google_ads',
  'tiktok',
  'snapchat',
]);

export const CONSENT_CATEGORIES = Object.freeze(['necessary', 'analytics', 'marketing']);
export const CONSENT_COOKIE_NAME = 'pdpl_consent';

/**
 * Generates an event ID for client/server deduplication (e.g. Meta Pixel + CAPI, GA4 client + MP).
 * @param {string} [prefix='evt']
 * @returns {string}
 */
export function generateEventId(prefix = 'evt') {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${ts}_${rnd}`;
}

/**
 * Schema for UTM parameters and marketing click-IDs captured on the storefront and attached to checkout.
 */
export const attributionSchema = z
  .object({
    utmSource: plainText({ max: 100 }).optional(),
    utmMedium: plainText({ max: 100 }).optional(),
    utmCampaign: plainText({ max: 100 }).optional(),
    utmTerm: plainText({ max: 100 }).optional(),
    utmContent: plainText({ max: 100 }).optional(),
    gclid: plainText({ max: 200 }).optional(),
    fbclid: plainText({ max: 200 }).optional(),
    ttclid: plainText({ max: 200 }).optional(),
    sclid: plainText({ max: 200 }).optional(),
    fbp: plainText({ max: 100 }).optional(),
    fbc: plainText({ max: 100 }).optional(),
    gaClientId: plainText({ max: 100 }).optional(),
    referrer: plainText({ max: 500 }).optional(),
    landingPage: plainText({ max: 500 }).optional(),
    clientUserAgent: plainText({ max: 500 }).optional(),
    clientIpAddress: plainText({ max: 100 }).optional(),
  })
  .strict();

/**
 * Specific client and credentials schemas per provider.
 */
const gtmConfigSchema = z
  .object({
    containerId: z
      .string()
      .trim()
      .regex(/^GTM-[A-Z0-9]+$/, { error: V.CODE_INVALID })
      .or(z.literal(''))
      .optional(),
    serverUrl: httpUrl.or(z.literal('')).optional(),
  })
  .strict();

const ga4ConfigSchema = z
  .object({
    measurementId: z
      .string()
      .trim()
      .regex(/^G-[A-Z0-9]+$/, { error: V.CODE_INVALID })
      .or(z.literal(''))
      .optional(),
    apiSecret: z.string().trim().max(100).optional(),
    debugMode: z.boolean().optional(),
  })
  .strict();

const metaConfigSchema = z
  .object({
    pixelId: z
      .string()
      .trim()
      .regex(/^\d{6,24}$/, { error: V.CODE_INVALID })
      .or(z.literal(''))
      .optional(),
    capiToken: z.string().trim().max(500).optional(),
    testEventCode: z.string().trim().max(50).optional(),
  })
  .strict();

const googleAdsConfigSchema = z
  .object({
    conversionId: z
      .string()
      .trim()
      .regex(/^(AW-)?\d+$/, { error: V.CODE_INVALID })
      .or(z.literal(''))
      .optional(),
    conversionLabel: z.string().trim().max(100).optional(),
  })
  .strict();

const tiktokConfigSchema = z
  .object({
    pixelId: z.string().trim().max(50).optional(),
    accessToken: z.string().trim().max(500).optional(),
  })
  .strict();

const snapchatConfigSchema = z
  .object({
    pixelId: z.string().trim().max(50).optional(),
    apiToken: z.string().trim().max(500).optional(),
  })
  .strict();

export const PROVIDER_CONFIG_SCHEMAS = {
  gtm: gtmConfigSchema,
  ga4: ga4ConfigSchema,
  meta: metaConfigSchema,
  google_ads: googleAdsConfigSchema,
  tiktok: tiktokConfigSchema,
  snapchat: snapchatConfigSchema,
};

/**
 * Update payload schema for a tracking provider integration.
 */
export const updateTrackingIntegrationSchema = z
  .object({
    enabled: z.boolean({ error: V.INVALID_TYPE }).default(false),
    clientConfig: z.record(z.string(), z.unknown()).default({}),
    credentials: z.record(z.string(), z.string()).optional(),
    events: z
      .array(z.string().refine((e) => Object.values(TRACKING_EVENTS).includes(e)))
      .default(Object.values(TRACKING_EVENTS)),
  })
  .strict();

/**
 * Consent banner settings schema (PDPL).
 */
export const consentSettingsSchema = z
  .object({
    enabled: z.boolean({ error: V.INVALID_TYPE }).default(true),
    defaultAnalytics: z.boolean({ error: V.INVALID_TYPE }).default(false),
    defaultMarketing: z.boolean({ error: V.INVALID_TYPE }).default(false),
    consentModeV2: z.boolean({ error: V.INVALID_TYPE }).default(true),
    privacyPolicyUrl: httpUrl.or(z.string().regex(/^\/[a-zA-Z0-9_/-]*$/)).optional(),
  })
  .strict();

/**
 * Formats a normalized e-commerce item for dataLayer and server tracking.
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.name
 * @param {number} input.price - minor units (halalas) or decimal SAR
 * @param {number} [input.quantity=1]
 * @param {string} [input.sku]
 * @param {string} [input.category]
 * @param {string} [input.brand]
 * @param {string} [input.variant]
 * @returns {object}
 */
export function buildEcomItem({ id, name, price, quantity = 1, sku, category, brand, variant }) {
  const priceNum =
    typeof price === 'number' && Number.isInteger(price) ? price / 100 : Number(price) || 0;

  return {
    item_id: sku || id,
    item_name: name,
    price: priceNum,
    quantity,
    ...(category && { item_category: category }),
    ...(brand && { item_brand: brand }),
    ...(variant && { item_variant: variant }),
  };
}

/**
 * Constructs a standard GA4-compatible e-commerce dataLayer event payload.
 */
export function buildDataLayerPayload(event, options = {}) {
  const {
    eventId,
    currency = 'SAR',
    value,
    items,
    transaction_id,
    tax,
    shipping,
    coupon,
    search_term,
    ...extra
  } = options;

  const valueNum =
    typeof value === 'number'
      ? Number.isInteger(value) && value > 100
        ? value / 100
        : value
      : Number(value) || 0;

  const payload = {
    event,
    event_id: eventId || generateEventId(),
    ...extra,
  };

  if (
    items !== undefined ||
    value !== undefined ||
    transaction_id !== undefined ||
    tax !== undefined ||
    shipping !== undefined
  ) {
    payload.ecommerce = {
      currency,
      ...(transaction_id !== undefined && { transaction_id }),
      ...(value !== undefined && { value: valueNum }),
      ...(tax !== undefined && { tax }),
      ...(shipping !== undefined && { shipping }),
      ...(coupon !== undefined && { coupon }),
      ...(items && { items }),
    };
  }

  if (search_term) {
    payload.search_term = search_term;
  }

  return payload;
}

export const TRACKING_LOG_STATUS = Object.freeze(['pending', 'success', 'failed', 'skipped']);

/**
 * Maps standard tracking event names to Meta Conversions API standard event names.
 */
export const META_EVENT_MAP = Object.freeze({
  page_view: 'PageView',
  view_item_list: 'ViewContent',
  view_item: 'ViewContent',
  search: 'Search',
  add_to_cart: 'AddToCart',
  remove_from_cart: 'Custom',
  view_cart: 'ViewContent',
  begin_checkout: 'InitiateCheckout',
  add_shipping_info: 'AddPaymentInfo',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  refund: 'Custom',
  sign_up: 'CompleteRegistration',
  login: 'Custom',
  generate_lead: 'Lead',
});

/**
 * Normalizes phone numbers for marketing platform hashing (e.g. Meta CAPI, Google Ads).
 * Extracts digits only and resolves Saudi national leading zeros.
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhoneForTracking(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('05') && digits.length === 10) {
    return `966${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Schema for querying tracking event logs in the admin viewer.
 */
export const trackingLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  provider: z.enum(TRACKING_PROVIDERS).optional(),
  event: z.string().trim().optional(),
  status: z.enum(TRACKING_LOG_STATUS).optional(),
  search: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/**
 * Schema for dispatching a test tracking event from the admin UI.
 */
export const testEventSchema = z.object({
  provider: z.enum(TRACKING_PROVIDERS),
  event: z
    .string()
    .refine((e) => Object.values(TRACKING_EVENTS).includes(e))
    .default('purchase'),
  testEventCode: z.string().trim().max(100).optional(),
  orderNumber: z.string().trim().max(100).optional(),
  value: z.number().nonnegative().optional().default(100),
  currency: z.string().trim().length(3).default('SAR'),
});

/**
 * Schema for server-side event ingestion.
 */
export const serverEventIngestSchema = z.object({
  event: z.string().refine((e) => Object.values(TRACKING_EVENTS).includes(e)),
  eventId: z.string().trim().max(100).optional(),
  orderNumber: z.string().trim().max(100).optional(),
  orderId: z.string().trim().max(50).optional(),
  currency: z.string().trim().length(3).default('SAR'),
  value: z.number().nonnegative().optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  customer: z
    .object({
      email: z.string().trim().max(255).optional(),
      phone: z.string().trim().max(50).optional(),
      name: z.string().trim().max(255).optional(),
    })
    .optional(),
  attribution: attributionSchema.optional(),
});
