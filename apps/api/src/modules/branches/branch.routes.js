import express from 'express';
import { createBranchSchemas, createCategorySchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './branch.controller.js';

/**
 * Mounted at `/api/v1/branches`. Branch-scoped staff only ever see their own branches.
 *  GET    /public                 PUBLIC — active stores (store locator / pick-up), names per language
 *  GET    /                       branch.view — branches in the actor's scope (+ staffCount)
 *  GET    /:id                    branch.view
 *  POST   /                       branch.manage — HQ staff only (role covers all branches)
 *  PATCH  /:id                    branch.manage — within scope
 *  DELETE /:id                    branch.manage — HQ only; refused while in use (deactivate instead)
 *  GET    /:id/staff              branch.view + staff.view
 *  POST   /:id/staff              branch.manage + staff.manage — { staffId } assign
 *  DELETE /:id/staff/:staffId     branch.manage + staff.manage — unassign
 */
export function createBranchRouter({ schemas = createBranchSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  const view = requirePermission(P.BRANCH_VIEW);
  const manage = requirePermission(P.BRANCH_MANAGE);
  const manageStaff = requirePermission(P.BRANCH_MANAGE, P.STAFF_MANAGE);

  r.get('/public', validate({ query: createCategorySchemas().publicQuery }), c.publicList);
  r.get('/', view, c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.delete('/:id', manage, id, c.remove);
  r.get('/:id/staff', requirePermission(P.BRANCH_VIEW, P.STAFF_VIEW), id, c.staff);
  r.post(
    '/:id/staff',
    manageStaff,
    validate({ params: schemas.idParam, body: schemas.assignStaff }),
    c.assign,
  );
  r.delete(
    '/:id/staff/:staffId',
    manageStaff,
    validate({ params: schemas.staffParam }),
    c.unassign,
  );
  return r;
}
