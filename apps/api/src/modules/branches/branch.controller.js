import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import * as service from './branch.service.js';

export const list = async (req, res) => sendData(res, await service.listBranches(req.access));
export const get = async (req, res) =>
  sendData(res, await service.getBranch(req.access, req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createBranch(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateBranch(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteBranch(req.access, req.valid.params.id);
  sendNoContent(res);
};
export const staff = async (req, res) =>
  sendData(res, await service.branchStaff(req.access, req.valid.params.id));
export const assign = async (req, res) =>
  sendData(res, await service.assignStaff(req.access, req.valid.params.id, req.valid.body.staffId));
export const unassign = async (req, res) =>
  sendData(
    res,
    await service.unassignStaff(req.access, req.valid.params.id, req.valid.params.staffId),
  );
export const publicList = async (req, res) => {
  const lang = requestLanguage(req, req.valid.query.lang);
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Vary', 'Accept-Language, Cookie');
  sendData(res, await service.listPublicBranches(lang), { meta: { lang } });
};
