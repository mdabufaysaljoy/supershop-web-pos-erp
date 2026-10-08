import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import * as service from './admin.service.js';

export const overview = async (_req, res) => sendData(res, await service.getOverview());
export const testProvider = async (req, res) =>
  sendData(res, await service.testProvider(req.access));

export const listGlossary = async (_req, res) => sendData(res, await service.listGlossary());
export const createGlossary = async (req, res) =>
  sendCreated(res, await service.createGlossaryTerm(req.access, req.valid.body));
export const updateGlossary = async (req, res) =>
  sendData(res, await service.updateGlossaryTerm(req.access, req.valid.params.id, req.valid.body));
export const deleteGlossary = async (req, res) => {
  await service.deleteGlossaryTerm(req.access, req.valid.params.id);
  sendNoContent(res);
};

export const publicUiOverrides = async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  sendData(res, await service.getUiOverrideMap(req.valid.params.catalog, req.valid.params.lang));
};
export const listUiOverrides = async (req, res) =>
  sendData(res, await service.listUiOverrides(req.valid.params.catalog, req.valid.params.lang));
export const setUiOverride = async (req, res) =>
  sendData(res, await service.setUiOverride(req.access, req.valid.params, req.valid.body));
export const removeUiOverride = async (req, res) => {
  await service.removeUiOverride(req.access, req.valid.params);
  sendNoContent(res);
};

export const retranslate = async (req, res) =>
  sendData(res, await service.retranslate(req.access, req.valid.body), { status: 202 });
export const retryJob = async (req, res) => {
  await service.retryJob(req.access, req.valid.params.id);
  sendNoContent(res);
};
export const retryAllFailed = async (req, res) => {
  await service.retryAllFailed(req.access);
  sendNoContent(res);
};
