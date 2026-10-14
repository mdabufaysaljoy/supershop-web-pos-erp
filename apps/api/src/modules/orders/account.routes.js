import express from 'express';
import { createAccountSchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import * as c from './order.controller.js';

/**
 * Mounted at `/api/v1/account/orders` — the signed-in customer's own order history.
 *  GET /            page of their orders (newest first)
 *  GET /:id         one order, full snapshot; 404 for anyone else's
 */
export function createAccountOrdersRouter({ schemas = createAccountSchemas() } = {}) {
  const r = express.Router();
  r.use(requireAuth(PRINCIPAL_TYPES.CUSTOMER), (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  r.get('/', validate({ query: schemas.ordersQuery }), c.myOrders);
  r.get('/:id', validate({ params: schemas.orderParam }), c.myOrder);
  return r;
}
