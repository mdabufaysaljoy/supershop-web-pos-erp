import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { moneyMinor, objectId, plainText, slug } from '../validators/fields.js';
import { percentOf } from '../money.js';

/**
 * Payment methods the shop offers (P4.2). Admin-managed data, not code: a shop can switch cash
 * off, rename "card", reorder the list or add its own ("bank transfer", "pay at the branch")
 * without a deploy. Labels and instructions are English source, auto-translated (§5.7).
 */
export const PAYMENT_METHOD = Object.freeze({
  /**
   * What the storefront must DO with the method — the one thing code cares about:
   *  - `gateway`  send the customer to the configured gateway's payment page (P4.1)
   *  - `cod`      collect on delivery
   *  - `offline`  the customer pays another way and the shop confirms it (transfer, at the branch)
   *  - `cash`     handed over at the counter (P6.1) — the only kind that can be overpaid
   *  - `mfs`      mobile financial services / digital wallet (bKash, Nagad, STC Pay, Urpay)
   */
  TYPES: Object.freeze(['gateway', 'cod', 'offline', 'cash', 'mfs']),
  /** What may be chosen where: a website cannot take cash, a counter cannot use a payment page. */
  ONLINE_TYPES: Object.freeze(['gateway', 'cod', 'offline', 'mfs']),
  POS_TYPES: Object.freeze(['cash', 'offline', 'mfs']),
  /** Only cash can be overpaid, with the difference handed back as change. */
  CHANGE_TYPES: Object.freeze(['cash']),
  /** Keys the shop cannot delete: the ones checkout and the till know how to finish themselves. */
  BUILT_IN: Object.freeze(['card', 'cod', 'cash']),
  LABEL_MAX: 60,
  INSTRUCTIONS_MAX: 500,
  /** A percentage fee, in basis points (250 = 2.5%), like every other rate (D-017). */
  FEE_BPS_MAX: 5000,
});

/** A method's fee: a fixed amount, a percentage of the order, or both. */
export const feeSchema = z
  .object({
    fixed: moneyMinor({ allowZero: true }).optional(),
    bps: z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .min(0, { error: V.MONEY_NEGATIVE })
      .max(PAYMENT_METHOD.FEE_BPS_MAX, { error: V.MONEY_TOO_LARGE })
      .optional(),
  })
  .strict();

/**
 * What a method adds to an order (pure: the storefront's summary and the API agree to the halala).
 * The percentage applies to the goods + delivery the customer sees, rounded once (D-017).
 * @param {{ fixed?: number, bps?: number } | null | undefined} fee
 * @param {number} base  order total before the payment fee, in minor units
 * @returns {number} the fee in minor units
 */
export function paymentFee(fee, base) {
  if (!fee) return 0;
  const percentage = fee.bps ? percentOf(base, fee.bps) : 0;
  return (fee.fixed ?? 0) + percentage;
}

export function createPaymentMethodSchemas() {
  const fields = {
    /** Shown to the customer; English source, Arabic generated. */
    label: plainText({ min: 1, max: PAYMENT_METHOD.LABEL_MAX }),
    /** "Transfer to IBAN …, then send us the receipt." */
    instructions: plainText({ max: PAYMENT_METHOD.INSTRUCTIONS_MAX }).optional(),
    enabled: z.boolean({ error: V.INVALID_TYPE }).optional(),
    fee: feeSchema.optional(),
    iconId: objectId.nullable().optional(),
    /** Hide a method for small or large baskets (e.g. no cash over 5,000 SAR). */
    minTotal: moneyMinor({ allowZero: true }).nullable().optional(),
    maxTotal: moneyMinor({ allowZero: false }).nullable().optional(),
  };

  return {
    idParam: z.object({ id: objectId }),
    /** Only custom methods are created; the built-in ones are seeded and can only be edited. */
    create: z
      .object({
        ...fields,
        key: slug.refine((v) => !PAYMENT_METHOD.BUILT_IN.includes(v), { error: V.ALREADY_EXISTS }),
        type: z.enum(['offline', 'mfs'], { error: V.INVALID_TYPE }).default('offline'),
      })
      .strict()
      .refine((v) => v.maxTotal == null || v.minTotal == null || v.maxTotal > v.minTotal, {
        error: V.INVALID_TYPE,
        path: ['maxTotal'],
      }),
    update: z
      .object({
        ...fields,
        label: fields.label.optional(),
        type: z.enum(['offline', 'mfs'], { error: V.INVALID_TYPE }).optional(),
      })
      .strict()
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED })
      .refine((v) => v.maxTotal == null || v.minTotal == null || v.maxTotal > v.minTotal, {
        error: V.INVALID_TYPE,
        path: ['maxTotal'],
      }),
    /** The whole list, in the order the customer should see it. */
    reorder: z.object({ ids: z.array(objectId).min(1).max(50) }).strict(),
    publicQuery: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
      channel: z.enum(['online', 'pos'], { error: V.INVALID_TYPE }).optional(),
    }),
  };
}
