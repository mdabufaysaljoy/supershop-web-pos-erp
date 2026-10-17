import { PRINCIPAL_TYPES } from '@supershop/shared';
import { sendData } from '../../core/http.js';
import { requestContext, sendSession } from '../auth/index.js';
import * as service from './customer.service.js';

export async function register(req, res) {
  const { tokens, profile } = await service.registerCustomer(req.valid.body, requestContext(req));
  sendSession(res, PRINCIPAL_TYPES.CUSTOMER, tokens, { profile }, 201);
}

// ------------------------------------------------------------------ P7.2 admin handlers

export async function adminList(req, res) {
  const { items, total } = await service.listCustomersForAdmin(req.valid.query);
  const { page, limit } = req.valid.query;
  res.set('Cache-Control', 'private, no-store');
  sendData(res, items, { meta: { total, page, limit } });
}

export async function getSegments(req, res) {
  const counts = await service.getCustomerSegmentsSummary(req.valid?.query ?? req.query);
  res.set('Cache-Control', 'private, no-store');
  sendData(res, counts);
}

export async function adminGet(req, res) {
  const detail = await service.getCustomerDetailForAdmin(req.valid.params.id);
  res.set('Cache-Control', 'private, no-store');
  sendData(res, detail);
}

export async function adminUpdate(req, res) {
  const updated = await service.updateCustomerByAdmin(
    req.access,
    req.valid.params.id,
    req.valid.body,
  );
  res.set('Cache-Control', 'private, no-store');
  sendData(res, updated);
}
