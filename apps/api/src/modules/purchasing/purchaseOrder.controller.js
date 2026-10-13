import { sendCreated, sendData } from '../../core/http.js';
import { parseIdempotencyKey } from '../../core/idempotency.js';
import * as service from './purchaseOrder.service.js';

export const list = async (req, res) => {
  const { items, meta } = await service.listPurchaseOrders(req.access, req.valid.query);
  sendData(res, items, { meta });
};
export const get = async (req, res) =>
  sendData(res, await service.getPurchaseOrder(req.access, req.valid.params.id));
export const create = async (req, res) =>
  sendCreated(res, await service.createPurchaseOrder(req.access, req.valid.body));
export const update = async (req, res) =>
  sendData(res, await service.updatePurchaseOrder(req.access, req.valid.params.id, req.valid.body));
export const place = async (req, res) =>
  sendData(res, await service.placePurchaseOrder(req.access, req.valid.params.id, req.valid.body));
export const close = async (req, res) =>
  sendData(res, await service.closePurchaseOrder(req.access, req.valid.params.id, req.valid.body));
export const cancel = async (req, res) =>
  sendData(res, await service.cancelPurchaseOrder(req.access, req.valid.params.id, req.valid.body));
export const receive = async (req, res) => {
  const { order, replayed } = await service.receivePurchaseOrder(
    req.access,
    req.valid.params.id,
    req.valid.body,
    parseIdempotencyKey(req.get('Idempotency-Key')),
  );
  if (replayed) res.set('Idempotent-Replayed', 'true');
  sendData(res, order);
};
