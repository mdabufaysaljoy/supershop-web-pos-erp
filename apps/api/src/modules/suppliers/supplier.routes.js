import express from 'express';
import { createSupplierSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './supplier.controller.js';

/**
 * Mounted at `/api/v1/suppliers` (staff only — no public endpoint).
 *  GET    /       supplier.manage | purchase.view | purchase.manage — ?page&limit&sort&q
 *  GET    /:id    same
 *  POST   /       supplier.manage
 *  PATCH  /:id    supplier.manage
 *  DELETE /:id    supplier.manage — soft delete (not while in use)
 */
export function createSupplierRouter({ schemas = createSupplierSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  const view = requireAnyPermission(P.SUPPLIER_MANAGE, P.PURCHASE_VIEW, P.PURCHASE_MANAGE);
  const manage = requirePermission(P.SUPPLIER_MANAGE);

  r.get('/', view, validate({ query: schemas.listQuery }), c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.delete('/:id', manage, id, c.remove);
  return r;
}
