import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import * as service from './customField.service.js';

export const list = async (req, res) =>
  sendData(res, await service.listDefinitions(req.valid.query.entity));
export const create = async (req, res) =>
  sendCreated(res, await service.createDefinition(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateDefinition(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteDefinition(req.access, req.valid.params.id);
  sendNoContent(res);
};
