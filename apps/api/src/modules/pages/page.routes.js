import express from 'express';
import { createPageSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './page.controller.js';

/**
 * Mounted at `/api/v1/pages`.
 *  GET    /public/home        PUBLIC — the published home page, in one language
 *  GET    /public/:slug       PUBLIC — a published page by its address
 *  GET    /                   page.view
 *  GET    /:id                page.view — draft + published + the page's text
 *  POST   /                   page.manage
 *  PATCH  /:id                page.manage — save the draft
 *  POST   /:id/publish        page.publish
 *  POST   /:id/unpublish      page.publish
 *  POST   /:id/versions/:versionId/restore   page.manage — brings an older version into the draft
 *  DELETE /:id                page.manage — soft delete
 */
export function createPageRouter({ schemas = createPageSchemas() } = {}) {
  const r = express.Router();
  const id = validate({ params: schemas.idParam });
  const view = requireAnyPermission(P.PAGE_VIEW, P.PAGE_MANAGE);
  const manage = requirePermission(P.PAGE_MANAGE);
  const publish = requirePermission(P.PAGE_PUBLISH);
  const publicQuery = validate({ query: schemas.publicQuery });

  r.get('/public/home', publicQuery, c.publicHome);
  r.get(
    '/public/:slug',
    validate({ params: schemas.slugParam, query: schemas.publicQuery }),
    c.publicBySlug,
  );

  r.get('/', view, validate({ query: schemas.listQuery }), c.list);
  r.get('/:id', view, id, c.get);
  r.post('/', manage, validate({ body: schemas.create }), c.create);
  r.patch('/:id', manage, validate({ params: schemas.idParam, body: schemas.update }), c.update);
  r.post('/:id/publish', publish, id, c.publish);
  r.post('/:id/unpublish', publish, id, c.unpublish);
  r.post(
    '/:id/versions/:versionId/restore',
    manage,
    validate({ params: schemas.versionParams }),
    c.restore,
  );
  r.delete('/:id', manage, id, c.remove);
  return r;
}
