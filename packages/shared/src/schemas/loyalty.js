import { z } from 'zod';
import { LOYALTY } from '../loyalty/loyalty.js';
import { objectId, plainText } from '../validators/fields.js';
import { V } from '../validators/messages.js';

const int = (min, max) =>
  z
    .number({ error: V.INVALID_TYPE })
    .int({ error: V.INVALID_TYPE })
    .min(min, { error: V.TOO_SHORT })
    .max(max, { error: V.TOO_LONG });

export { LOYALTY };

export function createLoyaltySchemas() {
  const adjustPoints = z.object({
    customerId: objectId,
    delta: z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .refine((n) => n !== 0, { message: 'Points adjustment delta cannot be 0' }),
    reason: plainText({ min: 1, max: 200 }),
  });

  const redeemPoints = z.object({
    customerId: objectId,
    points: int(1, 1_000_000),
    orderId: objectId.optional(),
    orderNo: plainText({ min: 1, max: 64 }).optional(),
    orderTotalHalalas: int(0, 100_000_000).optional(),
  });

  const quoteRedemption = z.object({
    customerId: objectId.optional(),
    points: int(1, 1_000_000),
    orderTotalHalalas: int(0, 100_000_000).optional(),
  });

  const lookupQuery = z.object({
    q: plainText({ min: 1, max: 200 }),
  });

  const ledgerQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(Object.values(LOYALTY.TRANSACTION_TYPES)).optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
  });

  const customerParam = z.object({
    customerId: objectId,
  });

  return {
    adjustPoints,
    redeemPoints,
    quoteRedemption,
    lookupQuery,
    ledgerQuery,
    customerParam,
  };
}
