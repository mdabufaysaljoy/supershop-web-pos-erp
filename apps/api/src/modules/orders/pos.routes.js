import express from 'express';
import { createPosSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './order.controller.js';

/**
 * Mounted at `/api/v1/pos` — the till (P6.1).
 *  POST /quote   pos.sell — what the basket comes to, before anyone pays
 *  POST /sales   pos.sell — rings the sale up (needs `Idempotency-Key`)
 *
 * Scanning and searching use the catalogue's own endpoints (`/products/lookup`, `/products/variants`).
 */
export function createPosRouter({ schemas = createPosSchemas() } = {}) {
  const r = express.Router();
  const sell = requirePermission(P.POS_SELL);

  r.post('/quote', sell, validate({ body: schemas.quote }), c.posQuote);
  r.post('/sales', sell, validate({ body: schemas.sale }), c.posSale);
  return r;
}
