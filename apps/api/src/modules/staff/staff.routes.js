import express from 'express';
import { createRbacSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission, requireStaff } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './staff.controller.js';

/**
 * Mounted at `/api/v1/staff`.
 *  GET    /me/access              any active staff — permissions/branches for the admin `can()`
 *  GET    /                       staff.view (branch-scoped)
 *  GET    /:id                    staff.view (branch-scoped)
 *  POST   /                       staff.manage (+ escalation guards)
 *  PATCH  /:id                    staff.manage (+ escalation, self, last-super-admin guards)
 *  DELETE /:id                    staff.manage (soft delete)
 *  POST   /:id/sessions/revoke    staff.manage — force logout everywhere
 */
const defaultSchemas = createRbacSchemas();

/** @param {{ getSchemas?: () => ReturnType<typeof createRbacSchemas> }} [opts] settings-aware schemas */
export function createStaffRouter({ getSchemas = () => defaultSchemas } = {}) {
  const r = express.Router();
  const schemas = defaultSchemas; // params/query schemas don't depend on settings
  const id = validate({ params: schemas.idParam });
  const view = requirePermission(P.STAFF_VIEW);
  const manage = requirePermission(P.STAFF_MANAGE);

  r.get('/me/access', requireStaff(), c.myAccess);
  r.get('/', view, validate({ query: schemas.staffListQuery }), c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: () => getSchemas().staffCreate }), c.create);
  r.patch(
    '/:id',
    manage,
    validate({ params: schemas.idParam, body: () => getSchemas().staffUpdate }),
    c.update,
  );
  r.delete('/:id', manage, id, c.remove);
  r.post('/:id/sessions/revoke', manage, id, c.revokeSessions);
  return r;
}
