import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './site.service.js';

/** Thin HTTP layer: parse (already validated) → service → respond. */

export const listMenus = async (_req, res) => sendData(res, await service.listMenus());

export const getMenu = async (req, res) =>
  sendData(res, await service.getMenu(req.valid.params.id));

export const createMenu = async (req, res) =>
  sendCreated(res, await service.createMenu(req.access, req.valid.body));

export const updateMenu = async (req, res) =>
  sendData(res, await service.updateMenu(req.access, req.valid.params.id, req.valid.body));

export const deleteMenu = async (req, res) => {
  await service.deleteMenu(req.access, req.valid.params.id);
  sendNoContent(res);
};

export const getLayout = async (_req, res) => sendData(res, await service.getLayout());

export const updateLayout = async (req, res) =>
  sendData(res, await service.updateLayout(req.access, req.valid.body));

/** PUBLIC: the header, footer, announcement bar and theme in one language (ISR-cached). */
export const publicChrome = async (req, res) => {
  const lang = requestLanguage(req, req.valid.query?.lang);
  res.set('Cache-Control', 'public, max-age=60');
  sendData(res, await service.getSiteChrome(lang));
};

export const listRedirects = async (_req, res) => sendData(res, await service.listRedirects());

export const createRedirect = async (req, res) =>
  sendCreated(res, await service.createRedirect(req.access, req.valid.body));

export const deleteRedirect = async (req, res) => {
  await service.deleteRedirect(req.access, req.valid.params.id);
  sendNoContent(res);
};

/** PUBLIC: the redirect rules, for the storefront's edge to apply (cached briefly). */
export const publicRedirects = async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  sendData(res, await service.getPublicRedirects());
};
