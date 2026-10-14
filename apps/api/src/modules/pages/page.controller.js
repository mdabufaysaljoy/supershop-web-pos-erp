import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './page.service.js';

/** Thin HTTP layer: parse (already validated) → service → respond. */

export const list = async (req, res) => {
  const { data, meta } = await service.listPages(req.valid.query);
  sendData(res, data, { meta });
};

export const get = async (req, res) => sendData(res, await service.getPage(req.valid.params.id));

export const create = async (req, res) =>
  sendCreated(res, await service.createPage(req.valid.body, req.access));

export const update = async (req, res) =>
  sendData(res, await service.updatePage(req.valid.params.id, req.valid.body, req.access));

export const publish = async (req, res) =>
  sendData(res, await service.publishPage(req.valid.params.id, req.access));

export const unpublish = async (req, res) =>
  sendData(res, await service.unpublishPage(req.valid.params.id, req.access));

export const remove = async (req, res) => {
  await service.deletePage(req.valid.params.id, req.access);
  sendNoContent(res);
};

/** PUBLIC: one published page in one language (ISR-cached by the storefront). */
const publicPage = (finder) => async (req, res) => {
  const lang = requestLanguage(req, req.valid.query?.lang);
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vary', 'Accept-Language, Cookie');
  sendData(res, await finder(req, lang), { meta: { lang } });
};

export const publicBySlug = publicPage((req, lang) =>
  service.getPublicPage({ slug: req.valid.params.slug }, lang),
);
export const publicHome = publicPage((_req, lang) => service.getPublicPage({ home: true }, lang));
