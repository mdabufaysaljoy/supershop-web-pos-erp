import { sendCreated, sendData, sendNoContent } from '../../core/http.js';
import * as service from './supplier.service.js';

export const list = async (req, res) => {
  const { items, meta } = await service.listSuppliers(req.valid.query);
  sendData(res, items, { meta });
};
export const get = async (req, res) =>
  sendData(res, await service.getSupplier(req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createSupplier(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updateSupplier(req.access, req.valid.params.id, req.valid.body));
export const remove = async (req, res) => {
  await service.deleteSupplier(req.access, req.valid.params.id);
  sendNoContent(res);
};
