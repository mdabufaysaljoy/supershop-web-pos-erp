import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { objectId } from '../validators/fields.js';

/** Storefront cart contracts (P3.2). Quantities are whole units; the per-line maximum is a setting. */
export const CART = Object.freeze({
  MAX_LINES: 100,
  /** Hard ceiling; the effective maximum is `cart.maxLineQty` (and stock). */
  MAX_QTY: 9999,
  /** Guest carts expire after this many days without changes. */
  GUEST_TTL_DAYS: 30,
  /** Per-line notices returned with the cart (shown once, then cleared). */
  NOTICES: Object.freeze(['price_changed', 'qty_reduced']),
  LINE_STATUS: Object.freeze(['ok', 'out_of_stock', 'unavailable']),
});

const qty = (min) =>
  z.preprocess(
    (v) => (typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : v),
    z
      .number({ error: V.QTY_INVALID })
      .int({ error: V.QTY_INVALID })
      .min(min, { error: V.QTY_INVALID })
      .max(CART.MAX_QTY, { error: V.QTY_TOO_LARGE }),
  );

export function createCartSchemas() {
  return {
    query: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
    variantParam: z.object({ variantId: objectId }),
    addItem: z.object({ variantId: objectId, qty: qty(1).default(1) }),
    /** 0 removes the line. */
    setQty: z.object({ qty: qty(0) }),
  };
}
