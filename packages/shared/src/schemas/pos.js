import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { POS } from '../pos/sale.js';
import { V } from '../validators/messages.js';
import {
  email,
  moneyMinor,
  name,
  objectId,
  phone,
  plainText,
  quantity,
} from '../validators/fields.js';

/**
 * POS sale contracts (P6.1). The till sends what the cashier did — items, discounts, who is
 * paying, how — and nothing else: prices, VAT and totals are decided by the server from the
 * catalogue and the shop's settings, never taken from the screen.
 */
const discount = z
  .object({
    type: z.enum(POS.DISCOUNT_TYPES, { error: V.INVALID_TYPE }),
    /** Basis points for `percent` (1000 = 10%), halalas for `amount`. */
    value: z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .min(1, { error: V.TOO_SHORT }),
  })
  .strict();

/**
 * @param {{ maxDiscountBps?: number, allowInternationalPhone?: boolean }} [opts] from settings
 */
export function createPosSchemas({
  maxDiscountBps = 10_000,
  allowInternationalPhone = false,
} = {}) {
  const bounded = discount.refine((d) => d.type !== 'percent' || d.value <= maxDiscountBps, {
    error: V.TOO_LONG,
    path: ['value'],
  });

  const item = z
    .object({
      variantId: objectId,
      qty: quantity({ max: POS.MAX_QTY }),
      /** Only with `pos.priceOverride`; otherwise the catalogue price stands. */
      unitPrice: moneyMinor({ allowZero: true }).optional(),
      discount: bounded.nullish(),
    })
    .strict();

  const customer = z
    .object({
      mode: z.enum(POS.CUSTOMER_MODES, { error: V.INVALID_TYPE }).default('walkin'),
      name: name.optional(),
      phone: phone({ allowInternational: allowInternationalPhone }).optional(),
      email: email.optional(),
    })
    .strict()
    .refine((c) => c.mode !== 'contact' || Boolean(c.phone || c.email), {
      error: V.REQUIRED,
      path: ['phone'],
    });

  const payment = z
    .object({
      /** A method the shop offers (`cash`, `card`, or one of its own, P4.2). */
      method: plainText({ min: 1, max: 40 }),
      amount: moneyMinor({ allowZero: false }),
      /** The terminal's slip number, a transfer reference — whatever the cashier was given. */
      reference: plainText({ max: 60 }).optional(),
    })
    .strict();

  const sale = z
    .object({
      branchId: objectId,
      items: z.array(item).min(1, { error: V.REQUIRED }).max(POS.MAX_LINES),
      orderDiscount: bounded.nullish(),
      customer: customer.default({ mode: 'walkin' }),
      payments: z.array(payment).min(1, { error: V.REQUIRED }).max(POS.MAX_PAYMENTS),
      note: plainText({ max: 300 }).optional(),
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    })
    .strict();

  return {
    /** Scan or type at the till (P6.2). */
    search: z.object({
      q: plainText({ min: 1, max: 60 }),
      branchId: objectId,
      limit: z.coerce
        .number({ error: V.INVALID_TYPE })
        .int({ error: V.INVALID_TYPE })
        .min(1, { error: V.INVALID_TYPE })
        .max(25, { error: V.TOO_LONG })
        .default(10),
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
    sale,
    /** Same sale without the money: what it would come to, before anyone pays. */
    quote: sale
      .omit({ payments: true })
      .extend({ payments: z.array(payment).max(POS.MAX_PAYMENTS).optional() }),
  };
}
