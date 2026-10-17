import { sendCreated, sendData } from '../../core/http.js';
import * as service from './loyalty.service.js';

export const getSelfAccount = async (req, res) => {
  const customerId = req.auth.principalId;
  const account = await service.getOrCreateAccount(customerId);
  return sendData(res, service.toLoyaltyAccountDto(account));
};

export const getSelfLedger = async (req, res) => {
  const customerId = req.auth.principalId;
  const result = await service.listCustomerLedger(customerId, req.valid.query);
  return sendData(res, result.items.map(service.toLoyaltyLedgerDto), {
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
};

export const lookup = async (req, res) => {
  const result = await service.lookupMembership(req.valid.query.q);
  return sendData(res, result);
};

export const getCustomerAccount = async (req, res) => {
  const result = await service.getCustomerLoyaltySummary(req.valid.params.customerId);
  return sendData(res, result);
};

export const getCustomerLedger = async (req, res) => {
  const result = await service.listCustomerLedger(req.valid.params.customerId, req.valid.query);
  return sendData(res, result.items.map(service.toLoyaltyLedgerDto), {
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.pages,
    },
  });
};

export const adjust = async (req, res) => {
  const result = await service.adjustPoints(req.access, req.valid.body);
  return sendData(res, result);
};

export const quote = async (req, res) => {
  const customerId = req.auth?.principalId ?? req.valid.body?.customerId ?? null;
  const result = await service.quoteRedemption({
    customerId,
    points: req.valid.body.points,
    orderTotalHalalas: req.valid.body.orderTotalHalalas,
  });
  return sendData(res, result);
};

export const redeem = async (req, res) => {
  const result = await service.redeemPoints(req.valid.body);
  return sendCreated(res, result);
};

export const expire = async (req, res) => {
  const result = await service.expirePoints(req.valid.body ?? {});
  return sendData(res, result);
};
