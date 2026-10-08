import express from 'express';
import { createRbacSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './role.controller.js';

/**
 * Mounted at `/api/v1/roles`.
 *  GET    /              role.manage | staff.manage (staff editors pick roles)
 *  GET    /permissions   role.manage (registry for the role editor)
 *  GET    /:id           role.manage | staff.manage
 *  POST   /              role.manage (+ can only grant held permissions)
 *  PATCH  /:id           role.manage (+ escalation & self-edit guards)
 *  DELETE /:id           role.manage (not system roles, not in use)
 */
export function createRoleRouter({ schemas = createRbacSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  const viewRoles = requireAnyPermission(P.ROLE_MANAGE, P.STAFF_MANAGE);
  const manage = requirePermission(P.ROLE_MANAGE);

  r.get('/', viewRoles, c.list);
  r.get('/permissions', manage, c.permissions);
  r.get('/:id', viewRoles, id, c.get);
  r.post('/', manage, validate({ body: schemas.roleCreate }), c.create);
  r.patch(
    '/:id',
    manage,
    validate({ params: schemas.idParam, body: schemas.roleUpdate }),
    c.update,
  );
  r.delete('/:id', manage, id, c.remove);
  return r;
}
