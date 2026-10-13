import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import * as service from './role.service.js';

export const list = async (_req, res) => sendData(res, await service.listRoles());
export const permissions = async (_req, res) => sendData(res, service.getPermissionCatalog());
export const get = async (req, res) => sendData(res, await service.getRole(req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createRole(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateRole(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteRole(req.access, req.valid.params.id);
  sendNoContent(res);
};
