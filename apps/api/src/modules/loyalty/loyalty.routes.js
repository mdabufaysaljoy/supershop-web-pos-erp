import express from 'express';
import { createLoyaltySchemas, PERMISSIONS as P, PRINCIPAL_TYPES } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth } from '../auth/index.js';
import * as c from './loyalty.controller.js';

const defaultSchemas = createLoyaltySchemas();

export function createLoyaltyRouter({ schemas = defaultSchemas } = {}) {
  const r = express.Router();

  // Membership lookup by phone/email/customerId (accessible to cashiers and loyalty staff)
  r.get(
    '/lookup',
    ...requireAnyPermission(P.LOYALTY_VIEW, P.POS_SELL),
    validate({ query: schemas.lookupQuery }),
    c.lookup,
  );

  // Redemption quote calculation
  r.post(
    '/quote',
    optionalAuth(PRINCIPAL_TYPES.CUSTOMER),
    validate({ body: schemas.quoteRedemption }),
    c.quote,
  );

  // Staff customer profile & ledger views
  r.get(
    '/customers/:customerId',
    ...requirePermission(P.LOYALTY_VIEW),
    validate({ params: schemas.customerParam }),
    c.getCustomerAccount,
  );

  r.get(
    '/customers/:customerId/ledger',
    ...requirePermission(P.LOYALTY_VIEW),
    validate({ params: schemas.customerParam, query: schemas.ledgerQuery }),
    c.getCustomerLedger,
  );

  // Staff manual points adjustment
  r.post(
    '/adjust',
    ...requirePermission(P.LOYALTY_ADJUST),
    validate({ body: schemas.adjustPoints }),
    c.adjust,
  );

  // Cashier points redemption at counter
  r.post(
    '/redeem',
    ...requirePermission(P.POS_SELL),
    validate({ body: schemas.redeemPoints }),
    c.redeem,
  );

  // Trigger points expiry sweep
  r.post('/expire', ...requirePermission(P.LOYALTY_ADJUST), c.expire);

  return r;
}
