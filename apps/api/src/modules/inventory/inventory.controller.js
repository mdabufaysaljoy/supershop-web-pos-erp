import { sendCreated, sendData } from '../../core/http.js';
import { parseIdempotencyKey } from '../../core/idempotency.js';
import * as service from './inventory.service.js';

const key = (req) => parseIdempotencyKey(req.get('Idempotency-Key'));
/** 201 for a new operation; 200 + `Idempotent-Replayed` when the key was seen before. */
const sendOperation = (res, result) => {
  const { replayed, ...data } = result;
  if (replayed) {
    res.set('Idempotent-Replayed', 'true');
    return sendData(res, data);
  }
  return sendCreated(res, data);
};

export const levels = async (req, res) => {
  const { items, meta } = await service.listLevels(req.access, req.valid.query);
  sendData(res, items, { meta });
};
export const variantLevels = async (req, res) => {
  const { items, total } = await service.variantLevels(req.access, req.valid.params.variantId);
  sendData(res, items, { meta: { total } });
};
export const setThreshold = async (req, res) =>
  sendData(res, await service.setLowStockThreshold(req.access, req.valid.body));
export const movements = async (req, res) => {
  const { items, meta } = await service.listMovements(req.access, req.valid.query);
  sendData(res, items, { meta });
};
export const operations = async (req, res) => {
  const { items, meta } = await service.listOperations(req.access, req.valid.query);
  sendData(res, items, { meta });
};
export const operation = async (req, res) =>
  sendData(res, await service.getOperation(req.access, req.valid.params.id));
export const adjust = async (req, res) =>
  sendOperation(res, await service.adjustStock(req.access, req.valid.body, key(req)));
export const transfer = async (req, res) =>
  sendOperation(res, await service.transferStock(req.access, req.valid.body, key(req)));
export const receive = async (req, res) =>
  sendOperation(res, await service.receiveStock(req.access, req.valid.body, key(req)));
