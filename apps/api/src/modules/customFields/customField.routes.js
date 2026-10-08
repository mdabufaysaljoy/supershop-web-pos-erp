import express from 'express';
import { createCustomFieldSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission, requireStaff } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './customField.controller.js';

/**
 * Mounted at `/api/v1/custom-fields`.
 *  GET    /?entity=product   any staff (forms need the definitions; nothing sensitive)
 *  POST   /                  customField.manage
 *  PATCH  /:id               customField.manage (entity/key/type immutable)
 *  DELETE /:id               customField.manage (soft; key stays reserved)
 */
export function createCustomFieldRouter({ schemas = createCustomFieldSchemas() } = {}) {
  const r = express.Router();
  const manage = requirePermission(P.CUSTOM_FIELD_MANAGE);
  r.get('/', requireStaff(), validate({ query: schemas.listQuery }), c.list);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.delete('/:id', manage, validate({ params: schemas.idParam }), c.remove);
  return r;
}
