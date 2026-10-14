import { ERROR_CODES, EVENTS, ORDER } from '@supershop/shared';
import { createPaymentProvider } from '../../adapters/payments/index.js';
import { config } from '../../core/config.js';
import { sha256 } from '../../core/crypto.js';
import { AppError, BadRequestError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { applyPaymentOutcome, getOrderById } from '../orders/index.js';
import { getSecretSetting, getSetting } from '../settings/index.js';
import * as repo from './payment.repo.js';

/**
 * Payments (P4.1). Two shapes of money:
 *  - **COD**: nothing to collect now; a record is kept so every order has one payment history.
 *  - **Gateway ("card")**: the customer is sent to a hosted payment page; the result comes back
 *    twice — as a webhook and as the customer returning — and both go through the same code, so
 *    an order is never left pending because one of the two was lost.
 *
 * The gateway is reached ONLY through `adapters/payments`; this file names no vendor.
 */
const COD = 'cod';

const unavailable = (message = 'That payment method is not available') =>
  new AppError(ERROR_CODES.PAYMENT_METHOD_UNAVAILABLE, message, { status: 409 });

/** Rebuilt when the gateway settings change (values are frozen, so the key is cheap). */
let cached = { key: null, provider: null };

/** @returns {object | null} the configured gateway adapter, or null for a COD-only shop */
export function gateway({ fetchImpl } = {}) {
  const name = getSetting('payments.gateway');
  const secretKey = name === 'none' ? '' : (getSecretSetting(`payments.${name}.secretKey`) ?? '');
  // The key must change when the KEY changes, not just when one appears (never store it raw).
  const key = `${name}:${secretKey ? sha256(secretKey).slice(0, 16) : 'unset'}:${fetchImpl ? 'test' : 'live'}`;
  if (cached.key !== key) {
    cached = { key, provider: createPaymentProvider({ provider: name, secretKey, fetchImpl }) };
  }
  return cached.provider;
}

/** Tests inject a fake gateway; also used to drop the cache after a settings change. */
export const resetGatewayCache = () => {
  cached = { key: null, provider: null };
};

/** Methods the storefront may offer right now (P4.2 turns this into admin-managed methods). */
export function availableMethods({ fetchImpl } = {}) {
  const provider = gateway({ fetchImpl });
  return ORDER.PAYMENT_METHODS.filter((method) =>
    method === COD
      ? getSetting('payments.codEnabled')
      : getSetting('payments.cardEnabled') && Boolean(provider?.enabled),
  );
}

const webhookSecret = () => {
  const name = getSetting('payments.gateway');
  return name === 'none' ? '' : (getSecretSetting(`payments.${name}.webhookSecret`) ?? '');
};

export const toPaymentDto = (p) => ({
  id: String(p._id),
  method: p.method,
  status: p.status,
  amount: p.amount,
  refundedAmount: p.refundedAmount,
  currency: p.currency,
  redirectUrl: p.redirectUrl ?? null,
  failureMessage: p.failureMessage ?? null,
  paidAt: p.paidAt ?? null,
  createdAt: p.createdAt,
});

/** Where the gateway sends the customer back — their own confirmation page. */
const callbackUrl = (order, token) =>
  `${config.STOREFRONT_URL.replace(/\/+$/, '')}${order.lang && order.lang !== 'en' ? `/${order.lang}` : ''}` +
  `/checkout/confirmation?token=${encodeURIComponent(token)}`;

/**
 * Called right after an order is created (orders injects this): records the payment and, for a
 * gateway method, creates the hosted payment page.
 * @returns {Promise<{ payment: object, redirectUrl: string | null }>}
 */
export async function startPaymentForOrder(order, { token, fetchImpl } = {}) {
  const method = order.payment?.method ?? COD;
  if (!availableMethods({ fetchImpl }).includes(method)) throw unavailable();

  if (method === COD) {
    const payment = await repo.insertPayment({
      orderId: order._id,
      orderNo: order.orderNo,
      provider: COD,
      method: COD,
      status: 'pending',
      amount: order.totals.total,
      currency: order.currency,
    });
    return { payment, redirectUrl: null };
  }

  const provider = gateway({ fetchImpl });
  const checkout = await provider.createCheckout({
    orderNo: order.orderNo,
    amount: order.totals.total,
    currency: order.currency,
    description: `${order.orderNo}`,
    callbackUrl: callbackUrl(order, token),
    metadata: { orderNo: order.orderNo, orderId: String(order._id) },
  });
  const payment = await repo.insertPayment({
    orderId: order._id,
    orderNo: order.orderNo,
    provider: provider.name,
    method,
    status: checkout.status,
    amount: order.totals.total,
    currency: order.currency,
    gatewayRef: checkout.gatewayRef,
    redirectUrl: checkout.redirectUrl,
  });
  void eventBus.emit(EVENTS.PAYMENT_STARTED, {
    paymentId: String(payment._id),
    orderId: String(order._id),
    orderNo: order.orderNo,
    provider: provider.name,
    amount: payment.amount,
  });
  return { payment, redirectUrl: checkout.redirectUrl };
}

/**
 * One place where a gateway result becomes our state — used by the webhook AND by the customer
 * coming back, so whichever arrives first wins and the second one changes nothing.
 * @param {object} payment
 * @param {{ status: string, eventId?: string, amount?: number, chargeRef?: string | null, failureMessage?: string | null }} result
 */
async function applyResult(payment, result) {
  const terminal = payment.status === 'paid' || payment.status === 'refunded';
  if (terminal && result.status !== 'refunded') {
    // Nothing moves backwards, but a later event may still name the charge a refund needs.
    if (result.chargeRef && !payment.chargeRef)
      return (await repo.applyEvent(payment._id, null, { chargeRef: result.chargeRef })) ?? payment;
    return payment;
  }

  const paid = result.status === 'paid';
  if (paid && result.amount && result.amount !== payment.amount) {
    // Never mark an order paid for the wrong amount — a human looks at this.
    logger.error(
      { paymentId: String(payment._id), expected: payment.amount, received: result.amount },
      'payment amount mismatch',
    );
    throw new AppError(ERROR_CODES.PAYMENT_FAILED, 'Payment amount does not match the order', {
      status: 409,
    });
  }

  const updated = await repo.applyEvent(payment._id, result.eventId, {
    status: result.status,
    ...(result.chargeRef && { chargeRef: result.chargeRef }),
    ...(paid && { paidAt: new Date(), failureMessage: null }),
    ...(result.failureMessage !== undefined && { failureMessage: result.failureMessage }),
  });
  if (!updated) return payment; // the same event arrived twice

  await applyPaymentOutcome(String(updated.orderId), {
    status: updated.status,
    method: updated.method,
    gatewayRef: updated.gatewayRef,
  });
  void eventBus.emit(paid ? EVENTS.PAYMENT_SUCCEEDED : EVENTS.PAYMENT_FAILED, {
    paymentId: String(updated._id),
    orderId: String(updated.orderId),
    orderNo: updated.orderNo,
    status: updated.status,
    amount: updated.amount,
    method: updated.method,
  });
  return updated;
}

/** The gateway calls us. Unverifiable calls are refused — an unsigned webhook is anyone's. */
export async function handleWebhook(providerName, { rawBody, headers, fetchImpl } = {}) {
  const provider = gateway({ fetchImpl });
  if (!provider || provider.name !== providerName)
    throw new NotFoundError('Unknown payment gateway');

  const event = provider.parseWebhook({ rawBody, headers, secret: webhookSecret() });
  if (!event.ok) {
    logger.warn({ provider: providerName, reason: event.reason }, 'payment webhook refused');
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Webhook could not be verified', {
      status: 401,
    });
  }
  const payment = event.gatewayRef ? await repo.findByGatewayRef(event.gatewayRef) : null;
  if (!payment) {
    // Not ours (or a test ping): answer 200 so the gateway stops retrying something we never had.
    logger.info({ provider: providerName, ref: event.gatewayRef }, 'payment webhook ignored');
    return { applied: false };
  }
  await applyResult(payment, event);
  return { applied: true };
}

/**
 * Brings an order's payment up to date from the gateway. The confirmation page calls this when it
 * finds a pending gateway payment, so the customer sees the truth even if the webhook is late.
 */
export async function syncOrderPayment(order, { fetchImpl } = {}) {
  const payment = await repo.findLatestForOrder(order._id ?? order.id);
  if (!payment?.gatewayRef || payment.status === 'paid' || payment.status === 'refunded')
    return payment ?? null;
  const provider = gateway({ fetchImpl });
  if (!provider) return payment;
  try {
    const current = await provider.fetchPayment(payment.gatewayRef);
    if (current.status === payment.status) return payment;
    return await applyResult(payment, {
      ...current,
      eventId: `sync:${current.status}:${Date.now()}`,
    });
  } catch (err) {
    logger.warn({ err: { message: err.message } }, 'payment sync failed');
    return payment;
  }
}

/** The customer's payment page expired or failed: make them a new one for the same order. */
export async function retryPayment(order, { token, fetchImpl } = {}) {
  const latest = await repo.findLatestForOrder(order._id ?? order.id);
  if (latest?.status === 'paid') throw new BadRequestError('This order is already paid');
  if (!ORDER.GATEWAY_METHODS.includes(order.payment.method)) throw unavailable();
  return startPaymentForOrder(order, { token, fetchImpl });
}

/**
 * Refund, in part or in full (staff action, `order.refund`). The gateway is the source of truth
 * for what is refundable; we never let the total exceed what was paid.
 */
export async function refundPayment(paymentId, { amount, reason } = {}, actor, { fetchImpl } = {}) {
  const payment = await repo.findById(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status !== 'paid' && payment.status !== 'refunded')
    throw new BadRequestError('Only a paid payment can be refunded');

  const refundable = payment.amount - payment.refundedAmount;
  const value = amount ?? refundable;
  if (value <= 0 || value > refundable)
    throw new ValidationError(
      [{ path: 'amount', message: 'validation.money.tooLarge', code: 'too_big' }],
      'Refund is larger than the amount still refundable',
    );

  if (payment.provider === COD) throw new BadRequestError('Cash payments are refunded at the till');

  const provider = gateway({ fetchImpl });
  if (!provider) throw unavailable('The payment gateway is not configured');
  const result = await provider.refund({
    gatewayRef: payment.gatewayRef,
    chargeRef: payment.chargeRef,
    amount: value,
  });

  const refundedAmount = payment.refundedAmount + value;
  const updated = await repo.addRefund(
    payment._id,
    {
      refundRef: result.refundRef,
      amount: value,
      reason: reason ?? null,
      staffId: actor?.staffId ?? null,
    },
    { status: refundedAmount >= payment.amount ? 'refunded' : 'paid', refundedAmount },
  );
  await applyPaymentOutcome(String(updated.orderId), {
    status: updated.status,
    method: updated.method,
    gatewayRef: updated.gatewayRef,
    refundedAmount,
  });
  void eventBus.emit(EVENTS.PAYMENT_REFUNDED, {
    paymentId: String(updated._id),
    orderId: String(updated.orderId),
    orderNo: updated.orderNo,
    amount: value,
    refundedAmount,
    staffId: actor?.staffId ?? null,
  });
  return updated;
}

/** Payments of an order, for the admin order screen (P4.4) and the receipts (P6). */
export const listOrderPayments = async (orderId) =>
  (await repo.listForOrder(orderId)).map(toPaymentDto);

/** Used by the refund endpoint to check the order exists and is visible. */
export const orderOfPayment = async (paymentId) => {
  const payment = await repo.findById(paymentId);
  return payment ? getOrderById(String(payment.orderId)) : null;
};
