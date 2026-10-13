import { sendData } from '../../core/http.js';
import { requestLanguage } from '../i18n/index.js';
import { applyCartCookie, readCartToken } from './cart.cookies.js';
import * as service from './cart.service.js';

const ctxOf = (req) => ({ token: readCartToken(req), customerId: req.auth?.principalId ?? null });
const langOf = (req) => requestLanguage(req, req.valid.query?.lang);

/** Carts are personal: never cached anywhere. */
function respond(res, result) {
  applyCartCookie(res, result);
  res.set('Cache-Control', 'private, no-store');
  sendData(res, result.view);
}

export const get = async (req, res) => respond(res, await service.getCart(ctxOf(req), langOf(req)));
export const add = async (req, res) =>
  respond(res, await service.addItem(ctxOf(req), req.valid.body, langOf(req)));
export const setQty = async (req, res) =>
  respond(
    res,
    await service.setItemQty(
      ctxOf(req),
      req.valid.params.variantId,
      req.valid.body.qty,
      langOf(req),
    ),
  );
export const remove = async (req, res) =>
  respond(res, await service.removeItem(ctxOf(req), req.valid.params.variantId, langOf(req)));
export const clear = async (req, res) =>
  respond(res, await service.clearCart(ctxOf(req), langOf(req)));
