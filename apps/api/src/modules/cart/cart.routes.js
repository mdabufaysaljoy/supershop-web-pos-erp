import express from 'express';
import { createCartSchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { requireCsrfProtection } from '../../middleware/csrf.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth } from '../auth/index.js';
import * as c from './cart.controller.js';

/**
 * Mounted at `/api/v1/cart`. PUBLIC: guests (cart cookie) or signed-in customers (Bearer token;
 * a guest cart is merged into theirs on the first request after sign-in). Every response is the
 * revalidated cart view (`?lang` for names). Mutations require the CSRF header + allowed Origin.
 *  GET    /                    current cart
 *  POST   /items               { variantId, qty } add (adds to an existing line)
 *  PATCH  /items/:variantId    { qty } set quantity (0 = remove)
 *  DELETE /items/:variantId    remove line
 *  DELETE /                    empty the cart
 */
export function createCartRouter({ schemas = createCartSchemas() } = {}) {
  const r = express.Router();
  const query = validate({ query: schemas.query });
  const write = [
    requireCsrfProtection(),
    createRateLimiter({ name: 'cart', ...LIMITS.cart }),
    optionalAuth(PRINCIPAL_TYPES.CUSTOMER),
    query,
  ];

  r.get('/', optionalAuth(PRINCIPAL_TYPES.CUSTOMER), query, c.get);
  r.post('/items', ...write, validate({ body: schemas.addItem }), c.add);
  r.patch(
    '/items/:variantId',
    ...write,
    validate({ params: schemas.variantParam, body: schemas.setQty }),
    c.setQty,
  );
  r.delete('/items/:variantId', ...write, validate({ params: schemas.variantParam }), c.remove);
  r.delete('/', ...write, c.clear);
  return r;
}
