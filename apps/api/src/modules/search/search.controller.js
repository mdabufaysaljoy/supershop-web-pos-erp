import { sendData } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './search.service.js';

const publicHeaders = (res, lang) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.set('Vary', 'Accept-Language, Cookie');
  res.set('Content-Language', lang);
};

export const search = async (req, res) => {
  const { lang: requested, page, limit, ...query } = req.valid.query;
  const lang = requestLanguage(req, requested);
  const { items, total, facets } = await service.searchProducts({ ...query, page, limit }, lang);
  publicHeaders(res, lang);
  sendData(res, items, { meta: { page, limit, total, lang, facets } });
};
export const suggest = async (req, res) => {
  const lang = requestLanguage(req, req.valid.query.lang);
  publicHeaders(res, lang);
  sendData(res, await service.suggest(req.valid.query.q, lang), { meta: { lang } });
};
export const status = async (_req, res) => sendData(res, await service.indexStatus());
export const rebuild = async (_req, res) => {
  void service.rebuildIndex();
  sendData(res, await service.indexStatus(), { status: 202 });
};
