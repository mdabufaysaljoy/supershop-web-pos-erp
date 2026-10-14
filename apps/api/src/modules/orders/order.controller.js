import { sendCreated, sendData } from '../../core/http.js';
import { parseIdempotencyKey } from '../../core/idempotency.js';
import { readCartToken } from '../cart/index.js';
import { publicDefinitions } from '../customFields/index.js';
import { applyCartCookie } from '../cart/cart.cookies.js';
import { requestLanguage } from '../i18n/index.js';
import { PERMISSIONS as P } from '@supershop/shared';
import { ForbiddenError } from '../../core/errors.js';
import * as history from './order.history.js';
import * as states from './order.states.js';
import * as service from './order.service.js';

const ctxOf = (req) => ({ token: readCartToken(req), customerId: req.auth?.principalId ?? null });
const langOf = (req) => requestLanguage(req, req.valid.query?.lang);
const privately = (res) => res.set('Cache-Control', 'private, no-store');

/** The admin-defined checkout fields the form must render (public, per language). */
export const fields = async (req, res) => {
  const lang = langOf(req);
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vary', 'Accept-Language, Cookie');
  sendData(res, await publicDefinitions('checkout', lang), { meta: { lang } });
};

export const place = async (req, res) => {
  const { order, cookie, replayed } = await service.placeOrder(ctxOf(req), req.valid.body, {
    lang: langOf(req),
    idempotencyKey: parseIdempotencyKey(req.get('Idempotency-Key')),
  });
  applyCartCookie(res, { cookie });
  privately(res);
  if (replayed) {
    res.set('Idempotent-Replayed', 'true');
    return sendData(res, order);
  }
  return sendCreated(res, order);
};

export const confirmation = async (req, res) => {
  privately(res);
  sendData(res, await service.getOrderByToken(req.valid.query.token));
};

export const track = async (req, res) => {
  privately(res);
  sendData(res, await service.trackOrder(req.valid.query));
};

// ------------------------------------------------------------- P3.5 order history

export const myOrders = async (req, res) => {
  const { data, meta } = await history.listCustomerOrders(req.auth.principalId, req.valid.query);
  sendData(res, data, { meta });
};

export const myOrder = async (req, res) => {
  sendData(res, await history.getCustomerOrder(req.auth.principalId, req.valid.params.id));
};

// ------------------------------------------------------------- P4.3 the shop's own orders

export const adminList = async (req, res) => {
  const { data, meta } = await service.listOrdersForStaff(req.valid.query);
  privately(res);
  sendData(res, data, { meta });
};

export const adminGet = async (req, res) => {
  privately(res);
  sendData(res, await service.getOrderForStaff(req.valid.params.id));
};

export const transition = async (req, res) => {
  const { to, reason } = req.valid.body;
  // Calling an order off is its own permission: it moves money and stock, not just a label.
  if (to === 'cancelled' && !req.access?.can(P.ORDER_CANCEL))
    throw new ForbiddenError('You may not cancel orders');
  const { order } = await states.moveOrder(req.valid.params.id, to, {
    actor: req.access,
    reason,
  });
  privately(res);
  sendData(res, service.toStaffOrderDto(order));
};

export const ship = async (req, res) => {
  const order = await states.addShipment(req.valid.params.id, req.valid.body, {
    actor: req.access,
  });
  privately(res);
  sendData(res, service.toStaffOrderDto(order));
};
