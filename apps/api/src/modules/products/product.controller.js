import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './product.service.js';

export const list = async (req, res) => {
  const { items, meta } = await service.listProducts(req.valid.query);
  sendData(res, items, { meta });
};
export const get = async (req, res) =>
  sendData(res, await service.getProduct(req.access, req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createProduct(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateProduct(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteProduct(req.access, req.valid.params.id);
  sendNoContent(res);
};
export const publicGet = async (req, res) => {
  const lang = requestLanguage(req, req.valid.query.lang);
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vary', 'Accept-Language, Cookie');
  res.set('Content-Language', lang);
  sendData(res, await service.getPublicProduct(req.valid.params.slug, lang), { meta: { lang } });
};
