import express from 'express';
import { createPosSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './order.controller.js';

/** Query/params never depend on a setting, so one build of them is enough. */
const defaultSchemas = createPosSchemas();

/**
 * Mounted at `/api/v1/pos` — the till (P6.1).
 *  GET  /search  pos.sell — barcode / SKU / name → sellable variants, priced, with branch stock
 *  POST /quote   pos.sell — what the basket comes to, before anyone pays
 *  POST /sales   pos.sell — rings the sale up (needs `Idempotency-Key`)
 *
 * The body schemas come from `getSchemas()` per request, because two of the rules they carry are
 * the shop's to set: the discount a cashier may give (`pos.maxDiscountBps`) and whether a customer
 * may have a phone number from outside the Kingdom (`customers.allowInternationalPhone`).
 */
export function createPosRouter({ getSchemas = () => defaultSchemas } = {}) {
  const r = express.Router();
  const sell = requirePermission(P.POS_SELL);

  r.get('/search', sell, validate({ query: defaultSchemas.search }), c.posSearch);
  r.post('/quote', sell, validate({ body: () => getSchemas().quote }), c.posQuote);
  r.post('/sales', sell, validate({ body: () => getSchemas().sale }), c.posSale);
  return r;
}
