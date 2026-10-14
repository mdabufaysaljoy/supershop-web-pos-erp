import express from 'express';
import { createSiteSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as c from './site.controller.js';

/**
 * Mounted at `/api/v1/site`.
 *  GET    /public            PUBLIC — menus, announcement bar, footer note, theme (one language)
 *  GET    /menus             page.view | menu.manage
 *  GET    /menus/:id         page.view | menu.manage
 *  POST   /menus             menu.manage
 *  PATCH  /menus/:id         menu.manage
 *  DELETE /menus/:id         menu.manage — soft delete, and unwired from the header/footer
 *  GET    /layout            page.view | menu.manage
 *  PATCH  /layout            menu.manage — announcement bar, footer, theme, brand, contact, SEO
 *  GET    /redirects/public  PUBLIC — the rules the storefront applies
 *  GET    /redirects         page.view | seo.manage
 *  POST   /redirects         seo.manage
 *  DELETE /redirects/:id     seo.manage
 */
export function createSiteRouter({ schemas = createSiteSchemas() } = {}) {
  const r = express.Router();
  const view = requireAnyPermission(P.PAGE_VIEW, P.MENU_MANAGE);
  const manage = requirePermission(P.MENU_MANAGE);
  const id = validate({ params: schemas.idParam });

  r.get('/public', validate({ query: schemas.publicQuery }), c.publicChrome);
  r.get('/redirects/public', c.publicRedirects);

  r.get('/menus', view, c.listMenus);
  r.get('/menus/:id', view, id, c.getMenu);
  r.post('/menus', manage, validate({ body: schemas.menuCreate }), c.createMenu);
  r.patch(
    '/menus/:id',
    manage,
    validate({ params: schemas.idParam, body: schemas.menuUpdate }),
    c.updateMenu,
  );
  r.delete('/menus/:id', manage, id, c.deleteMenu);

  const seo = requirePermission(P.SEO_MANAGE);
  r.get('/redirects', requireAnyPermission(P.PAGE_VIEW, P.SEO_MANAGE), c.listRedirects);
  r.post('/redirects', seo, validate({ body: schemas.redirectCreate }), c.createRedirect);
  r.delete('/redirects/:id', seo, id, c.deleteRedirect);

  r.get('/layout', view, c.getLayout);
  r.patch('/layout', manage, validate({ body: schemas.layoutUpdate }), c.updateLayout);
  return r;
}
