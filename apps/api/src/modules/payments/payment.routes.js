import express from 'express';
import { createPaymentSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { requireCsrfProtection } from '../../middleware/csrf.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './payment.controller.js';

/**
 * Mounted at `/api/v1/payments`.
 *  POST /webhook/:provider   PUBLIC server-to-server: verified by the gateway's own secret, so no
 *                            session, no CSRF (a browser never sends it) — raw body, replay-safe
 *  POST /retry               PUBLIC with the confirmation token: a new payment page for an order
 *  GET  /methods             PUBLIC: the methods the storefront may offer
 *  POST /:id/refund          staff, `order.refund`
 *  GET  /order/:id           staff, `order.view`
 */
const schemas = createPaymentSchemas();

/** @param {{ deps?: { fetchImpl?: typeof fetch } }} [opts] tests inject a fake gateway */
export function createPaymentRouter({ deps = {} } = {}) {
  const r = express.Router();

  r.post(
    '/webhook/:provider',
    createRateLimiter({ name: 'payment-webhook', ...LIMITS.webhook }),
    validate({ params: schemas.providerParam }),
    c.webhook(deps),
  );
  r.post(
    '/retry',
    requireCsrfProtection(),
    createRateLimiter({ name: 'payment-retry', ...LIMITS.checkout }),
    validate({ body: schemas.retry }),
    c.retry(deps),
  );
  r.get('/methods', c.methods(deps));
  r.post(
    '/:id/refund',
    requirePermission(P.ORDER_REFUND),
    validate({ params: schemas.idParam, body: schemas.refund }),
    c.refund(deps),
  );
  r.get(
    '/order/:id',
    requirePermission(P.ORDER_VIEW),
    validate({ params: schemas.idParam }),
    c.forOrder,
  );
  return r;
}
