import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './paymentMethod.service.js';

/** Thin HTTP layer. `isGatewayReady` is injected by the router (payments owns that answer). */

const ctxOf = (req) => ({ requestId: req.id === undefined ? undefined : String(req.id) });

export const publicList = (isGatewayReady) => async (req, res) => {
  const lang = requestLanguage(req, req.valid.query?.lang);
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vary', 'Accept-Language, Cookie');
  sendData(res, await service.availableMethods({ isGatewayReady, lang }), { meta: { lang } });
};

export const list = async (_req, res) => sendData(res, await service.listMethods());
export const get = async (req, res) => sendData(res, await service.getMethod(req.valid.params.id));

export const create = async (req, res) =>
  sendCreated(res, await service.createMethod(req.valid.body, ctxOf(req)));

export const update = async (req, res) =>
  sendData(res, await service.updateMethod(req.valid.params.id, req.valid.body, ctxOf(req)));

export const remove = async (req, res) => {
  await service.removeMethod(req.valid.params.id, ctxOf(req));
  sendNoContent(res);
};

export const reorder = async (req, res) =>
  sendData(res, await service.reorderMethods(req.valid.body.ids, ctxOf(req)));
