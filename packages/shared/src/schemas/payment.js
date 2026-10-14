import { z } from 'zod';
import { V } from '../validators/messages.js';
import { moneyMinor, objectId } from '../validators/fields.js';

/**
 * Payments (P4.1). A payment record belongs to an order; the gateway is reached through an
 * adapter, so nothing here names a vendor (CLAUDE.md §3.3: `gatewayRef`, never `moyasarId`).
 */
export const PAYMENT = Object.freeze({
  /** Where the money is, from our side. The gateway's own words are mapped by its adapter. */
  STATUSES: Object.freeze(['pending', 'authorized', 'paid', 'failed', 'refunded']),
  /** A payment page we sent the customer to is only worth waiting for so long. */
  SESSION_TTL_MINUTES: 60,
});

export function createPaymentSchemas() {
  return {
    /** POST /payments/:id/refund — omit the amount to refund everything still refundable. */
    refund: z
      .object({
        amount: moneyMinor({ allowZero: false }).optional(),
        reason: z.string().trim().max(200).optional(),
      })
      .strict(),
    idParam: z.object({ id: objectId }),
    providerParam: z.object({ provider: z.string().trim().min(2).max(40, { error: V.TOO_LONG }) }),
    /** POST /payments/retry — the confirmation link proves the person owns the order. */
    retry: z.object({ token: z.string().trim().min(16).max(120) }).strict(),
  };
}
