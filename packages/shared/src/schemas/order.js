import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { email, name, objectId, phone, plainText } from '../validators/fields.js';
import { normalizeDigits } from '../digits.js';

/**
 * Orders & checkout (P3.4). Money is integer halalas. The lifecycle is config-driven (P4.3);
 * these are the states and the transitions the storefront can reach on its own.
 */
export const ORDER = Object.freeze({
  CHANNELS: Object.freeze(['online', 'pos']),
  STATUSES: Object.freeze([
    'pending',
    'paid',
    'cod_confirmed',
    'processing',
    'shipped',
    'delivered',
    'completed',
    'cancelled',
    'refunded',
    'partially_returned',
    'exchanged',
  ]),
  /** Storefront payment methods available before the gateway adapters land (P4.1). */
  PAYMENT_METHODS: Object.freeze(['cod']),
  PAYMENT_STATUSES: Object.freeze(['pending', 'authorized', 'paid', 'failed', 'refunded']),
  DELIVERY_METHODS: Object.freeze(['delivery']),
  NOTE_MAX: 500,
  MAX_LINES: 100,
  /** `?order=…&phone=…` tracking (P3.6) — how the order number is shown. */
  NUMBER_PREFIX: 'ORD-',
  /**
   * The steps a customer sees while an order travels (P3.6). Several statuses share a step:
   * "paid" and "cod_confirmed" are both still "placed". The lifecycle itself becomes
   * configuration in P4.3 — this map moves with it, the UI does not change.
   */
  TRACKING_STEPS: Object.freeze(['placed', 'processing', 'shipped', 'delivered']),
  STATUS_STEP: Object.freeze({
    pending: 'placed',
    paid: 'placed',
    cod_confirmed: 'placed',
    processing: 'processing',
    shipped: 'shipped',
    delivered: 'delivered',
    completed: 'delivered',
  }),
  /** An order that left the happy path: the steps are replaced by one clear statement. */
  CLOSED_STATUSES: Object.freeze(['cancelled', 'refunded', 'partially_returned', 'exchanged']),
});

/**
 * What the tracking page draws for a status (pure; the storefront and later the admin agree).
 * @param {string} status
 * @returns {{ closed: boolean, status: string, steps: { key: string, state: 'done'|'current'|'upcoming' }[] }}
 *   `closed` means the order stopped (cancelled/refunded/…): show the status, not the steps.
 */
export function trackingTimeline(status) {
  const closed = ORDER.CLOSED_STATUSES.includes(status);
  const current = ORDER.STATUS_STEP[status] ?? ORDER.TRACKING_STEPS[0];
  const reached = ORDER.TRACKING_STEPS.indexOf(current);
  return {
    closed,
    status,
    steps: ORDER.TRACKING_STEPS.map((key, i) => ({
      key,
      // A closed order keeps the steps it had reached, but nothing is "current" any more.
      state: i < reached ? 'done' : i === reached ? (closed ? 'done' : 'current') : 'upcoming',
    })),
  };
}

/** Saudi National Address fields (optional detail) + the free-text line people actually type. */
const digits = (n) =>
  z
    .string({ error: V.INVALID_TYPE })
    .trim()
    .transform((v) => normalizeDigits(v))
    .pipe(z.string().regex(new RegExp(`^\\d{${n}}$`), { error: V.INVALID_TYPE }));
const optional = (schema) =>
  z.union([z.literal('').transform(() => null), z.null(), schema]).optional();

export const shippingAddressSchema = z
  .object({
    city: plainText({ min: 2, max: 60 }),
    /** Street + building, as typed. */
    line1: plainText({ min: 3, max: 200 }),
    district: optional(plainText({ min: 1, max: 80 })),
    buildingNumber: optional(digits(4)),
    postalCode: optional(digits(5)),
    additionalNumber: optional(digits(4)),
    shortAddress: optional(
      z
        .string()
        .trim()
        .transform((v) => normalizeDigits(v).toUpperCase().replace(/\s/g, ''))
        .pipe(z.string().regex(/^[A-Z]{4}\d{4}$/, { error: V.INVALID_TYPE })),
    ),
    /** "Opposite the mosque", gate code… */
    landmark: optional(plainText({ min: 1, max: 200 })),
  })
  .strict();

/**
 * @param {{ allowInternationalPhone?: boolean }} [opts] from settings
 */
export function createCheckoutSchemas({ allowInternationalPhone = false } = {}) {
  return {
    /** POST /checkout — the whole guest form. Values are data: never translated (§5.7). */
    place: z
      .object({
        contact: z
          .object({
            name,
            phone: phone({ allowInternational: allowInternationalPhone }),
            email: optional(email),
          })
          .strict(),
        deliveryMethod: z
          .enum(ORDER.DELIVERY_METHODS, { error: V.INVALID_TYPE })
          .default('delivery'),
        address: shippingAddressSchema,
        paymentMethod: z.enum(ORDER.PAYMENT_METHODS, { error: V.INVALID_TYPE }),
        note: plainText({ max: ORDER.NOTE_MAX }).optional(),
        /** Admin-defined checkout fields; validated against their definitions server-side. */
        customFields: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
    /** GET /orders/track?number=&phone= (P3.6 uses the same pair). */
    trackQuery: z.object({
      number: z
        .string({ error: V.REQUIRED })
        .trim()
        .transform((v) => normalizeDigits(v).toUpperCase())
        .pipe(z.string().regex(/^[A-Z]{3}-\d{4,10}$/, { error: V.CODE_INVALID })),
      phone: phone({ allowInternational: allowInternationalPhone }),
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
    idParam: z.object({ id: objectId }),
  };
}

/**
 * Order totals from priced cart lines plus delivery (pure; the API and the storefront summary
 * agree). Delivery is VAT-inclusive or VAT-exclusive exactly like product prices.
 * @param {{ subtotal: number, net: number, vat: number, total: number, itemCount: number }} items
 * @param {{ gross: number, net: number, vat: number }} delivery
 */
export const orderTotals = (items, delivery) => ({
  itemCount: items.itemCount,
  subtotal: items.subtotal,
  deliveryFee: delivery.gross,
  net: items.net + delivery.net,
  vat: items.vat + delivery.vat,
  total: items.total + delivery.gross,
});
