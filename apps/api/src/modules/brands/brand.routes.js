import express from 'express';
import { createBrandSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './brand.controller.js';

/**
 * Mounted at `/api/v1/brands`.
 *  GET    /public   PUBLIC — visible brands in one language (?lang | cookie | Accept-Language)
 *  GET    /         brand.manage | product.view — ?page&limit&sort=name|-createdAt&q
 *  GET    /:id      brand.manage | product.view
 *  POST   /         brand.manage
 *  PATCH  /:id      brand.manage
 *  DELETE /:id      brand.manage — soft delete (not while products use it)
 */
export function createBrandRouter({ schemas = createBrandSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  const view = requireAnyPermission(P.BRAND_MANAGE, P.PRODUCT_VIEW);
  const manage = requirePermission(P.BRAND_MANAGE);

  r.get('/public', validate({ query: schemas.publicQuery }), c.publicList);
  r.get('/', view, validate({ query: schemas.listQuery }), c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.delete('/:id', manage, id, c.remove);
  return r;
}
