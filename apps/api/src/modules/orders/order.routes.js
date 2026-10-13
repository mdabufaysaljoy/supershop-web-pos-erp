import express from 'express';
import { createCheckoutSchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { z } from 'zod';
import { requireCsrfProtection } from '../../middleware/csrf.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth } from '../auth/index.js';
import { createCategorySchemas } from '@supershop/shared';
import * as c from './order.controller.js';

/**
 * Mounted at `/api/v1/checkout` (PUBLIC — guests with a cart cookie, or signed-in customers).
 *  GET  /fields                admin-defined checkout fields in the page language
 *  POST /                      place the cart as an order (CSRF + rate limit; `Idempotency-Key`)
 *  GET  /confirmation?token=   the order behind a confirmation link
 *  GET  /track?number=&phone=  order status by number + phone (P3.6 uses this too)
 */
export function createCheckoutRouter({ schemas = createCheckoutSchemas() } = {}) {
  const r = express.Router();
  const query = validate({ query: createCategorySchemas().publicQuery });

  r.get('/fields', query, c.fields);
  r.post(
    '/',
    requireCsrfProtection(),
    createRateLimiter({ name: 'checkout', ...LIMITS.checkout }),
    optionalAuth(PRINCIPAL_TYPES.CUSTOMER),
    query,
    validate({ body: schemas.place }),
    c.place,
  );
  r.get(
    '/confirmation',
    createRateLimiter({ name: 'order-lookup', ...LIMITS.orderLookup }),
    validate({ query: z.object({ token: z.string().trim().min(16).max(120) }) }),
    c.confirmation,
  );
  r.get(
    '/track',
    createRateLimiter({ name: 'order-lookup', ...LIMITS.orderLookup }),
    validate({ query: schemas.trackQuery }),
    c.track,
  );
  return r;
}
