import { createHmac } from 'node:crypto';
import { safeEqual } from '../../core/crypto.js';
import { AppError } from '../../core/errors.js';
import { ERROR_CODES } from '@supershop/shared';

/**
 * Stripe (Global / Saudi Arabia) — Hosted Checkout Session flow.
 *
 * The customer is redirected to Stripe Checkout, supporting cards, Mada, Apple Pay, Google Pay,
 * and regional methods without sensitive cardholder data touching our server (PCI DSS compliant).
 * Amounts are passed as integer minor units (halalas / cents).
 *
 * Endpoints used:
 *   POST /v1/checkout/sessions      create the hosted checkout page
 *   GET  /v1/checkout/sessions/:id  read session and payment status
 *   POST /v1/refunds                refund part or all of a captured payment intent
 * Webhooks arrive signed with HMAC-SHA256 in the Stripe-Signature header.
 */
const DEFAULT_BASE_URL = 'https://api.stripe.com/v1';
const TIMEOUT_MS = 15_000;

const gatewayError = (message, details) =>
  new AppError(ERROR_CODES.PAYMENT_FAILED, message, { status: 502, details });

/**
 * Serializes nested objects and arrays into standard application/x-www-form-urlencoded
 * format expected by Stripe API (e.g. line_items[0][price_data][unit_amount]=1000).
 */
export function serializeStripeParams(data, prefix = '') {
  const parts = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const propName = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(serializeStripeParams(value, propName));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          parts.push(serializeStripeParams(item, `${propName}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${propName}[${index}]`)}=${encodeURIComponent(item)}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(propName)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

/** @param {{ secretKey: string, fetchImpl?: typeof fetch, baseUrl?: string }} cfg */
export function createStripeProvider({ secretKey, fetchImpl, baseUrl = DEFAULT_BASE_URL }) {
  const call = async (path, { method = 'GET', body } = {}) => {
    if (secretKey && secretKey.startsWith('pk_')) {
      throw gatewayError(
        'Stripe secret key is invalid: a publishable key (starts with "pk_") was configured instead of a secret key (starts with "sk_"). Please configure your secret key in Settings -> Payments.',
      );
    }
    let res;
    try {
      const isPost = method === 'POST';
      const encodedBody = body ? serializeStripeParams(body) : undefined;
      res = await (fetchImpl ?? globalThis.fetch)(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: 'application/json',
          ...(isPost && { 'Content-Type': 'application/x-www-form-urlencoded' }),
        },
        body: encodedBody,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw gatewayError('The payment service did not answer');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message ?? json?.message ?? `Payment service error (${res.status})`;
      throw gatewayError(msg, { status: res.status });
    }
    return json ?? {};
  };

  const toPayment = (session) => {
    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    const isExpired = session.status === 'expired';
    const status = isPaid ? 'paid' : isExpired ? 'failed' : 'pending';
    return {
      gatewayRef: String(session.id),
      status,
      amount: Number(session.amount_total ?? 0),
      paidAmount: isPaid ? Number(session.amount_total ?? 0) : 0,
      redirectUrl: session.url ?? null,
      failureMessage: session.last_payment_error?.message ?? null,
      chargeRef: session.payment_intent ? String(session.payment_intent) : null,
    };
  };

  return {
    name: 'stripe',
    enabled: Boolean(secretKey),

    async createCheckout({ orderNo, amount, currency, description, callbackUrl, metadata }) {
      const curr = (currency || 'SAR').toLowerCase();
      const params = {
        mode: 'payment',
        success_url: `${callbackUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${callbackUrl}&canceled=true`,
        client_reference_id: orderNo,
        line_items: [
          {
            price_data: {
              currency: curr,
              unit_amount: amount,
              product_data: {
                name: description || orderNo || 'Order Payment',
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          orderNo: orderNo || metadata?.orderNo || '',
          ...(metadata?.orderId && { orderId: String(metadata.orderId) }),
        },
      };

      const session = await call('/checkout/sessions', {
        method: 'POST',
        body: params,
      });

      if (!session.id || !session.url) {
        throw gatewayError('The payment service sent no payment page');
      }
      return toPayment(session);
    },

    async fetchPayment(gatewayRef) {
      const session = await call(`/checkout/sessions/${gatewayRef}`);
      return toPayment(session);
    },

    async refund({ chargeRef, gatewayRef, amount }) {
      let paymentIntent = chargeRef;
      if (!paymentIntent && gatewayRef) {
        try {
          const session = await call(`/checkout/sessions/${gatewayRef}`);
          paymentIntent = session.payment_intent ? String(session.payment_intent) : null;
        } catch {
          // Let following check handle missing intent
        }
      }
      if (!paymentIntent) {
        throw gatewayError('This payment cannot be refunded yet');
      }

      const body = {
        payment_intent: paymentIntent,
        ...(amount ? { amount } : {}),
      };

      const refundResult = await call('/refunds', {
        method: 'POST',
        body,
      });

      const refundStatus =
        refundResult.status === 'succeeded'
          ? 'refunded'
          : refundResult.status === 'failed'
            ? 'failed'
            : 'pending';

      return {
        refundRef: String(refundResult.id ?? paymentIntent),
        status: refundStatus,
        amount: Number(refundResult.amount ?? amount ?? 0),
      };
    },

    parseWebhook({ rawBody, headers, secret }) {
      if (!secret) return { ok: false, reason: 'missing_secret' };

      const sigHeader = headers?.['stripe-signature'] ?? headers?.['Stripe-Signature'] ?? '';
      if (!sigHeader) return { ok: false, reason: 'signature' };

      const rawStr =
        typeof rawBody === 'string' ? rawBody : rawBody ? rawBody.toString('utf8') : '';
      const parts = sigHeader.split(',').map((p) => p.trim());
      const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
      const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));

      if (!timestamp || !signatures.length) {
        return { ok: false, reason: 'signature' };
      }

      const payload = `${timestamp}.${rawStr}`;
      const computed = createHmac('sha256', secret).update(payload).digest('hex');
      const valid = signatures.some((sig) => safeEqual(computed, sig));
      if (!valid) {
        return { ok: false, reason: 'signature' };
      }

      let event;
      try {
        event = JSON.parse(rawStr);
      } catch {
        return { ok: false, reason: 'malformed' };
      }

      const type = String(event.type ?? '');
      const obj = event.data?.object ?? {};

      let gatewayRef = '';
      let chargeRef = null;
      let status = 'pending';
      let amount = 0;
      let failureMessage = null;

      if (type.startsWith('checkout.session.')) {
        gatewayRef = String(obj.id ?? '');
        chargeRef = obj.payment_intent ? String(obj.payment_intent) : null;
        status =
          obj.payment_status === 'paid' || obj.status === 'complete'
            ? 'paid'
            : obj.status === 'expired'
              ? 'failed'
              : 'pending';
        amount = Number(obj.amount_total ?? 0);
      } else if (type.startsWith('payment_intent.')) {
        gatewayRef = String(obj.client_reference_id ?? obj.metadata?.orderNo ?? obj.id ?? '');
        chargeRef = String(obj.id ?? '');
        status =
          type === 'payment_intent.succeeded'
            ? 'paid'
            : type === 'payment_intent.payment_failed'
              ? 'failed'
              : 'pending';
        amount = Number(obj.amount ?? 0);
        failureMessage = obj.last_payment_error?.message ?? null;
      } else if (type.startsWith('charge.')) {
        gatewayRef = String(obj.payment_intent ?? obj.id ?? '');
        chargeRef = String(obj.id ?? '');
        status =
          type === 'charge.refunded' ? 'refunded' : type === 'charge.failed' ? 'failed' : 'paid';
        amount = Number(obj.amount ?? 0);
        failureMessage = obj.failure_message ?? null;
      } else {
        gatewayRef = String(obj.id ?? '');
        status = 'pending';
      }

      return {
        ok: true,
        eventId: String(event.id ?? `${gatewayRef}:${type}`),
        type,
        gatewayRef,
        chargeRef,
        status,
        amount,
        failureMessage,
      };
    },
  };
}
