import express from 'express';
import { createCategorySchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './category.controller.js';

/**
 * Mounted at `/api/v1/categories`.
 *  GET    /public        PUBLIC — active tree in one language (?lang | cookie | Accept-Language)
 *  GET    /              category.manage | product.view (product editors pick categories)
 *  GET    /:id           same
 *  POST   /              category.manage
 *  PATCH  /:id           category.manage — content (name, description, slug, image, active, SEO)
 *  POST   /:id/move      category.manage — { parentId, index } re-parent and/or reorder
 *  DELETE /:id           category.manage — soft delete (no subcategories, no products)
 */
export function createCategoryRouter({ schemas = createCategorySchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  const view = requireAnyPermission(P.CATEGORY_MANAGE, P.PRODUCT_VIEW);
  const manage = requirePermission(P.CATEGORY_MANAGE);

  r.get('/public', validate({ query: schemas.publicQuery }), c.publicTree);
  r.get('/', view, c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.post('/:id/move', manage, validate({ params: schemas.idParam, body: schemas.move }), c.move);
  r.delete('/:id', manage, id, c.remove);
  return r;
}
