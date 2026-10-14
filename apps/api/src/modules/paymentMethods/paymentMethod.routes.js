import express from 'express';
import { createPaymentMethodSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './paymentMethod.controller.js';

/**
 * Mounted at `/api/v1/payment-methods`.
 *  GET    /public    PUBLIC — what the checkout may offer, in one language
 *  GET    /          settings.payments
 *  POST   /          settings.payments — custom (offline) methods only
 *  PATCH  /:id       settings.payments — label, instructions, fee, limits, on/off
 *  DELETE /:id       settings.payments — custom methods only; built-ins are switched off instead
 *  POST   /reorder   settings.payments — the whole list, in the new order
 */
const defaults = createPaymentMethodSchemas();

/** @param {{ schemas?: object, isGatewayReady?: () => boolean }} [opts] */
export function createPaymentMethodRouter({
  schemas = defaults,
  isGatewayReady = () => false,
} = {}) {
  const r = express.Router();
  const manage = requirePermission(P.SETTINGS_PAYMENTS);
  const id = validate({ params: schemas.idParam });

  r.get('/public', validate({ query: schemas.publicQuery }), c.publicList(isGatewayReady));
  r.get('/', manage, c.list);
  r.post('/reorder', manage, validate({ body: schemas.reorder }), c.reorder);
  r.get('/:id', manage, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.delete('/:id', manage, id, c.remove);
  return r;
}
