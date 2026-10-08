import express from 'express';
import { createProductSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './product.controller.js';

/**
 * Mounted at `/api/v1/products`.
 *  GET    /public/:slug   PUBLIC — active product in one language (?lang | cookie | Accept-Language)
 *  GET    /               product.view — ?page&limit&sort&q(name/slug/SKU/barcode)&status&categoryId&brandId&supplierId
 *  GET    /:id            product.view (cost only with product.viewCost)
 *  POST   /               product.create — product + variants (cost needs product.viewCost)
 *  PATCH  /:id            product.update — partial; `variants` = complete set
 *  DELETE /:id            product.delete — soft delete
 */
export function createProductRouter({ schemas = createProductSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });

  r.get(
    '/public/:slug',
    validate({ params: schemas.slugParam, query: schemas.publicQuery }),
    c.publicGet,
  );
  r.get('/', requirePermission(P.PRODUCT_VIEW), validate({ query: schemas.listQuery }), c.list);
  r.get('/:id', requirePermission(P.PRODUCT_VIEW), id, c.get);
  r.post('/', requirePermission(P.PRODUCT_CREATE), validate({ body: schemas.create }), c.create);
  r.patch(
    '/:id',
    requirePermission(P.PRODUCT_UPDATE),
    validate({ params: schemas.idParam, body: schemas.update }),
    c.update,
  );
  r.delete('/:id', requirePermission(P.PRODUCT_DELETE), id, c.remove);
  return r;
}
