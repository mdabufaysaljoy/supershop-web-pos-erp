import { sendData, sendNoContent } from '../../core/http.js';
import { NotFoundError } from '../../core/errors.js';
import { findOrderByConfirmationToken } from '../orders/index.js';
import * as service from './payment.service.js';

/** Thin HTTP layer. `deps` lets the tests hand in a fake gateway. */

export const webhook =
  (deps = {}) =>
  async (req, res) => {
    const { applied } = await service.handleWebhook(req.valid.params.provider, {
      rawBody: req.rawBody ?? req.body, // the exact bytes the gateway signed (app.js keeps them)
      headers: req.headers,
      ...deps,
    });
    // 200 either way: a gateway retries anything else, and "not ours" will never become ours.
    res.set('Cache-Control', 'no-store');
    sendData(res, { applied });
  };

export const refund =
  (deps = {}) =>
  async (req, res) => {
    const payment = await service.refundPayment(
      req.valid.params.id,
      req.valid.body,
      { staffId: req.access?.staffId ?? req.auth?.principalId ?? null },
      deps,
    );
    sendData(res, service.toPaymentDto(payment));
  };

/** The customer's payment page failed or expired: make a new one from the confirmation link. */
export const retry =
  (deps = {}) =>
  async (req, res) => {
    const order = await findOrderByConfirmationToken(req.valid.body.token);
    if (!order) throw new NotFoundError('Order not found');
    const { redirectUrl } = await service.retryPayment(order, {
      token: req.valid.body.token,
      ...deps,
    });
    res.set('Cache-Control', 'no-store');
    sendData(res, { redirectUrl });
  };

/** Payment methods the storefront may show right now (P4.2 replaces this with admin methods). */
export const methods =
  (deps = {}) =>
  async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    sendData(res, service.availableMethods(deps));
  };

export const forOrder = async (req, res) => {
  const payments = await service.listOrderPayments(req.valid.params.id);
  if (!payments.length) return sendNoContent(res);
  return sendData(res, payments);
};
