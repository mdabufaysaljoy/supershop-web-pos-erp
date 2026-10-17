import express from 'express';
import { createLoyaltySchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import * as c from './loyalty.controller.js';

const defaultSchemas = createLoyaltySchemas();

/**
 * Mounted at `/api/v1/account/loyalty` — the signed-in customer's own loyalty account.
 *  GET /          account balance, tier, lifetime stats
 *  GET /ledger    paginated ledger transactions
 */
export function createAccountLoyaltyRouter({ schemas = defaultSchemas } = {}) {
  const r = express.Router();

  r.use(requireAuth(PRINCIPAL_TYPES.CUSTOMER), (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  r.get('/', c.getSelfAccount);
  r.get('/ledger', validate({ query: schemas.ledgerQuery }), c.getSelfLedger);

  return r;
}
