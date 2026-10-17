import { z } from 'zod';
import { RETURN_EXCHANGE } from '../pos/returnExchange.js';
import { POS } from '../pos/sale.js';
import { V } from '../validators/messages.js';
import {
  moneyMinor,
  objectId,
  paginationQuery,
  plainText,
  quantity,
} from '../validators/fields.js';

/**
 * Return & exchange schemas (P6.6). Shared by the API and the admin UI.
 */
const discount = z
  .object({
    type: z.enum(POS.DISCOUNT_TYPES, { error: V.INVALID_TYPE }),
    value: z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .min(1, { error: V.TOO_SHORT }),
  })
  .strict();

const returnLine = z
  .object({
    variantId: objectId,
    qty: quantity({ max: POS.MAX_QTY }),
    disposition: z.enum(RETURN_EXCHANGE.DISPOSITIONS, { error: V.INVALID_TYPE }).default('restock'),
    reason: plainText({ max: RETURN_EXCHANGE.REASON_MAX }).optional(),
  })
  .strict();

const exchangeItem = z
  .object({
    variantId: objectId,
    qty: quantity({ max: POS.MAX_QTY }),
    unitPrice: moneyMinor({ allowZero: true }).optional(),
    discount: discount.nullish(),
  })
  .strict();

const payment = z
  .object({
    method: plainText({ min: 1, max: 40 }),
    amount: moneyMinor({ allowZero: false }),
    reference: plainText({ max: 60 }).optional(),
  })
  .strict();

export function createReturnExchangeSchemas() {
  return {
    idParam: z.object({ id: objectId }),
    orderIdParam: z.object({ orderId: objectId }),

    listQuery: paginationQuery({
      sortable: ['createdAt'],
      defaultSort: '-createdAt',
    })
      .extend({
        branchId: objectId.optional(),
        orderId: objectId.optional(),
        type: z.enum(RETURN_EXCHANGE.TYPES, { error: V.INVALID_TYPE }).optional(),
        q: plainText({ max: 60 }).optional(),
      })
      .strict(),

    lookupOrderQuery: z
      .object({
        q: plainText({ min: 1, max: 60 }),
      })
      .strict(),

    quote: z
      .object({
        orderId: objectId,
        type: z.enum(RETURN_EXCHANGE.TYPES, { error: V.INVALID_TYPE }).default('return'),
        branchId: objectId.optional(),
        returnLines: z
          .array(returnLine)
          .min(1, { error: V.REQUIRED })
          .max(RETURN_EXCHANGE.MAX_LINES),
        exchangeItems: z.array(exchangeItem).max(RETURN_EXCHANGE.MAX_LINES).optional(),
        orderDiscount: discount.nullish(),
        payments: z.array(payment).max(POS.MAX_PAYMENTS).optional(),
      })
      .strict(),

    create: z
      .object({
        orderId: objectId,
        type: z.enum(RETURN_EXCHANGE.TYPES, { error: V.INVALID_TYPE }).default('return'),
        branchId: objectId.optional(),
        returnLines: z
          .array(returnLine)
          .min(1, { error: V.REQUIRED })
          .max(RETURN_EXCHANGE.MAX_LINES),
        refundMethod: plainText({ min: 1, max: 40 }).optional(),
        exchangeItems: z.array(exchangeItem).max(RETURN_EXCHANGE.MAX_LINES).optional(),
        orderDiscount: discount.nullish(),
        payments: z.array(payment).max(POS.MAX_PAYMENTS).optional(),
        reason: plainText({ max: RETURN_EXCHANGE.REASON_MAX }).optional(),
        note: plainText({ max: 300 }).optional(),
      })
      .strict()
      .superRefine((val, ctx) => {
        if (val.type === 'exchange' && (!val.exchangeItems || val.exchangeItems.length === 0)) {
          ctx.addIssue({
            code: 'custom',
            path: ['exchangeItems'],
            message: V.REQUIRED,
          });
        }
        if (val.type === 'return' && !val.refundMethod) {
          ctx.addIssue({
            code: 'custom',
            path: ['refundMethod'],
            message: V.REQUIRED,
          });
        }
      }),

    printBody: z
      .object({
        profileId: objectId.optional(),
      })
      .strict(),
  };
}
