import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import * as service from './staff.service.js';

export const myAccess = async (req, res) => sendData(res, service.describeAccess(req.access));

export const list = async (req, res) => {
  const { items, meta } = await service.listStaff(req.access, req.valid.query);
  sendData(res, items, { meta });
};
export const get = async (req, res) =>
  sendData(res, await service.getStaff(req.access, req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createStaff(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateStaff(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteStaff(req.access, req.valid.params.id);
  sendNoContent(res);
};
export const revokeSessions = async (req, res) => {
  const revoked = await service.revokeStaffSessions(req.access, req.valid.params.id);
  sendData(res, { revoked });
};
