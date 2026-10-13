import express from 'express';
import { createPurchaseOrderSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './purchaseOrder.controller.js';

/**
 * Mounted at `/api/v1/purchase-orders`. Limited to the actor's branches (others → 404).
 *  GET   /               purchase.view | purchase.manage — ?status&supplierId&branchId&q&page&limit&sort
 *  GET   /:id            purchase.view | purchase.manage
 *  POST  /               purchase.manage — draft
 *  PATCH /:id            purchase.manage — header + COMPLETE line set (draft/ordered/partially received)
 *  POST  /:id/order      purchase.manage — draft → ordered
 *  POST  /:id/receive    inventory.receive + purchase.view|manage — { lines: [{ variantId, qty }] }
 *                        books a stock receipt; `Idempotency-Key` supported
 *  POST  /:id/close      purchase.manage — partially received → closed (rest won't come)
 *  POST  /:id/cancel     purchase.manage — draft/ordered with nothing received → cancelled
 */
export function createPurchaseOrderRouter({ schemas = createPurchaseOrderSchemas() } = {}) {
  const r = express.Router();
  const view = requireAnyPermission(P.PURCHASE_VIEW, P.PURCHASE_MANAGE);
  const manage = requirePermission(P.PURCHASE_MANAGE);
  const id = validate({ params: schemas.idParam });
  const action = validate({ params: schemas.idParam, body: schemas.action });

  r.get('/', view, validate({ query: schemas.listQuery }), c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.post('/:id/order', manage, action, c.place);
  r.post(
    '/:id/receive',
    requirePermission(P.INVENTORY_RECEIVE),
    view,
    validate({ params: schemas.idParam, body: schemas.receive }),
    c.receive,
  );
  r.post('/:id/close', manage, action, c.close);
  r.post('/:id/cancel', manage, action, c.cancel);
  return r;
}
