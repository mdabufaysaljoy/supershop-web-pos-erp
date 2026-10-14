import express from 'express';
import { createCheckoutSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './order.controller.js';

/**
 * Mounted at `/api/v1/orders` — the shop's own view of its orders (P4.3; the screens are P4.4).
 *  GET  /                    order.view — ?status&channel&q&page&limit&sort
 *  GET  /:id                 order.view — full order + what it may do next
 *  POST /:id/transitions     order.update — { to, reason }; cancelling needs order.cancel
 *  POST /:id/shipments       order.update — { carrier, trackingNumber?, trackingUrl? }
 *  POST /:id/notes           order.update — { text }: what the shop tells itself
 */
export function createOrderAdminRouter({ schemas = createCheckoutSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });

  r.get('/', requirePermission(P.ORDER_VIEW), validate({ query: schemas.listQuery }), c.adminList);
  r.get('/:id', requirePermission(P.ORDER_VIEW), id, c.adminGet);
  r.post(
    '/:id/transitions',
    requirePermission(P.ORDER_UPDATE),
    validate({ params: schemas.idParam, body: schemas.transition }),
    c.transition,
  );
  r.post(
    '/:id/shipments',
    requirePermission(P.ORDER_UPDATE),
    validate({ params: schemas.idParam, body: schemas.shipment }),
    c.ship,
  );
  r.post(
    '/:id/notes',
    requirePermission(P.ORDER_UPDATE),
    validate({ params: schemas.idParam, body: schemas.note }),
    c.addNote,
  );
  return r;
}
