import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './brand.service.js';

export const list = async (req, res) => {
  const { items, meta } = await service.listBrands(req.valid.query);
  sendData(res, items, { meta });
};
export const get = async (req, res) => sendData(res, await service.getBrand(req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createBrand(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateBrand(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteBrand(req.access, req.valid.params.id);
  sendNoContent(res);
};
export const publicList = async (req, res) => {
  const lang = requestLanguage(req, req.valid.query.lang);
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vary', 'Accept-Language, Cookie');
  res.set('Content-Language', lang);
  sendData(res, await service.listPublicBrands(lang), { meta: { lang } });
};
