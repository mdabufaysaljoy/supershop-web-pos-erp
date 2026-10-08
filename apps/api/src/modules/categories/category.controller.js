import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './category.service.js';

export const list = async (_req, res) => sendData(res, await service.listCategories());
export const get = async (req, res) =>
  sendData(res, await service.getCategory(req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createCategory(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateCategory(req.access, req.valid.params.id, req.valid.body));
export const move = async (req, res) =>
  sendData(res, await service.moveCategory(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteCategory(req.access, req.valid.params.id);
  sendNoContent(res);
};

/** Public, cacheable per language (storefront menus and category pages). */
export const publicTree = async (req, res) => {
  const lang = requestLanguage(req, req.valid.query.lang);
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vary', 'Accept-Language, Cookie');
  res.set('Content-Language', lang);
  sendData(res, await service.getPublicTree(lang), { meta: { lang } });
};
