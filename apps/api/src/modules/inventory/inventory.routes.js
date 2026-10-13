import express from 'express';
import { createInventorySchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './inventory.controller.js';

/**
 * Mounted at `/api/v1/inventory`. Everything is limited to the actor's branches; a transfer
 * needs both branches in scope. Write endpoints accept an `Idempotency-Key` header.
 *  GET  /levels                          inventory.view — ?branchId&productId&variantId&q&low
 *  GET  /variants/:variantId/levels      inventory.view — one variant across branches
 *  PUT  /levels/threshold                inventory.adjust — low-stock threshold per variant+branch
 *  GET  /movements                       inventory.view — ledger rows
 *  GET  /operations                      inventory.view — documents (adjustments, transfers…)
 *  GET  /operations/:id                  inventory.view — document + its ledger rows
 *  POST /adjust                          inventory.adjust — changes or stock counts, with reason
 *  POST /transfer                        inventory.transfer — between two branches, immediate
 *  POST /receive                         inventory.receive — goods received into a branch
 */
export function createInventoryRouter({ schemas = createInventorySchemas() } = {}) {
  const r = express.Router();
  const view = requirePermission(P.INVENTORY_VIEW);

  r.get('/levels', view, validate({ query: schemas.levelsQuery }), c.levels);
  r.get(
    '/variants/:variantId/levels',
    view,
    validate({ params: schemas.variantParam }),
    c.variantLevels,
  );
  r.put(
    '/levels/threshold',
    requirePermission(P.INVENTORY_ADJUST),
    validate({ body: schemas.threshold }),
    c.setThreshold,
  );
  r.get('/movements', view, validate({ query: schemas.movementsQuery }), c.movements);
  r.get('/operations', view, validate({ query: schemas.operationsQuery }), c.operations);
  r.get('/operations/:id', view, validate({ params: schemas.idParam }), c.operation);
  r.post(
    '/adjust',
    requirePermission(P.INVENTORY_ADJUST),
    validate({ body: schemas.adjust }),
    c.adjust,
  );
  r.post(
    '/transfer',
    requirePermission(P.INVENTORY_TRANSFER),
    validate({ body: schemas.transfer }),
    c.transfer,
  );
  r.post(
    '/receive',
    requirePermission(P.INVENTORY_RECEIVE),
    validate({ body: schemas.receive }),
    c.receive,
  );
  return r;
}
