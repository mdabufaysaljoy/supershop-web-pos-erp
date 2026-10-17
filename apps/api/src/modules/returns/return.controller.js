import { sendCreated, sendData } from '../../core/http.js';
import { parseIdempotencyKey } from '../../core/idempotency.js';
import * as service from './return.service.js';

export const list = async (req, res) => {
  const { data, meta } = await service.listReturnExchanges(req.access, req.valid.query);
  return sendData(res, data, { meta });
};

export const lookupOrder = async (req, res) =>
  sendData(res, await service.lookupOrderForReturn(req.access, req.valid.query));

export const quote = async (req, res) =>
  sendData(res, await service.quoteReturnExchange(req.access, req.valid.body));

export const create = async (req, res) => {
  const idempotencyKey = parseIdempotencyKey(req.get('Idempotency-Key'));
  const { record, replayed } = await service.createReturnExchange(req.access, req.valid.body, {
    idempotencyKey,
  });
  if (replayed) {
    res.set('Idempotent-Replayed', 'true');
    return sendData(res, record);
  }
  return sendCreated(res, record);
};

export const getOne = async (req, res) =>
  sendData(res, await service.getReturnExchange(req.access, req.valid.params.id));

export const printReceipt = async (req, res) =>
  sendData(res, await service.printReturnReceipt(req.access, req.valid.params.id, req.valid.body));
