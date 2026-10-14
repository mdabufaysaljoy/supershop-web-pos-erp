import { safeEqual } from '../../core/crypto.js';
import { AppError } from '../../core/errors.js';
import { ERROR_CODES } from '@supershop/shared';

/**
 * Moyasar (KSA) — hosted invoice flow (decision D-113).
 *
 * The customer is sent to an invoice page that Moyasar hosts, which covers Mada, credit cards,
 * Apple Pay and STC Pay without card data ever touching this server (no PCI scope here).
 * Amounts are integer halalas on both sides, so nothing is converted.
 *
 * Endpoints used (REST, HTTP Basic with the secret key as the username, empty password):
 *   POST /v1/invoices             create the hosted payment page
 *   GET  /v1/invoices/:id         read its state (the return trip and the webhook both end here)
 *   POST /v1/payments/:id/refund  refund part or all of a captured payment
 * Webhooks arrive as JSON carrying the account's `secret_token`; it is compared in constant time.
 *
 * NOTE: built from Moyasar's published API shape; verify against a sandbox account with real test
 * keys before go-live (PROGRESS.md open questions) — no account was available while writing it.
 */
const DEFAULT_BASE_URL = 'https://api.moyasar.com/v1';
const TIMEOUT_MS = 15_000;

/** Moyasar's vocabulary → ours (PAYMENT.STATUSES). */
const STATUS = {
  initiated: 'pending',
  pending: 'pending',
  authorized: 'authorized',
  captured: 'paid',
  paid: 'paid',
  failed: 'failed',
  voided: 'failed',
  refunded: 'refunded',
  expired: 'failed',
};

const gatewayError = (message, details) =>
  new AppError(ERROR_CODES.PAYMENT_FAILED, message, { status: 502, details });

/** @param {{ secretKey: string, fetchImpl?: typeof fetch, baseUrl?: string }} cfg */
export function createMoyasarProvider({ secretKey, fetchImpl, baseUrl = DEFAULT_BASE_URL }) {
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

  const call = async (path, { method = 'GET', body } = {}) => {
    let res;
    try {
      // Resolved per call: tests replace the global fetch, and a long-lived provider must see it.
      res = await (fetchImpl ?? globalThis.fetch)(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: auth,
          Accept: 'application/json',
          ...(body && { 'Content-Type': 'application/json' }),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw gatewayError('The payment service did not answer');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Gateway wording is for our logs; the customer sees a translated code (§5.7).
      throw gatewayError(json?.message ?? `Payment service error (${res.status})`, {
        status: res.status,
      });
    }
    return json ?? {};
  };

  const toPayment = (invoice) => ({
    gatewayRef: String(invoice.id),
    status: STATUS[invoice.status] ?? 'pending',
    amount: Number(invoice.amount ?? 0),
    paidAmount: invoice.status === 'paid' ? Number(invoice.amount ?? 0) : 0,
    redirectUrl: invoice.url ?? null,
    failureMessage: invoice.failure_message ?? invoice.message ?? null,
    /** The charge behind a paid invoice — refunds are made against this, not the invoice. */
    chargeRef: invoice.payments?.find((p) => STATUS[p.status] === 'paid')?.id ?? null,
  });

  return {
    name: 'moyasar',
    enabled: Boolean(secretKey),

    async createCheckout({ amount, currency, description, callbackUrl, metadata }) {
      const invoice = await call('/invoices', {
        method: 'POST',
        body: {
          amount, // halalas
          currency,
          description,
          callback_url: callbackUrl,
          metadata,
        },
      });
      if (!invoice.id || !invoice.url)
        throw gatewayError('The payment service sent no payment page');
      return toPayment(invoice);
    },

    fetchPayment: async (gatewayRef) => toPayment(await call(`/invoices/${gatewayRef}`)),

    /** `chargeRef` is the captured payment; invoices themselves are not refundable. */
    async refund({ chargeRef, amount }) {
      if (!chargeRef) throw gatewayError('This payment cannot be refunded yet');
      const payment = await call(`/payments/${chargeRef}/refund`, {
        method: 'POST',
        body: amount ? { amount } : {},
      });
      return {
        refundRef: String(payment.id ?? chargeRef),
        status: STATUS[payment.status] ?? 'refunded',
        amount: Number(payment.refunded ?? amount ?? 0),
      };
    },

    /**
     * Webhooks carry the account's secret token in the payload. Without a configured secret we
     * refuse the call rather than trust it (an unsigned webhook can be sent by anyone).
     */
    parseWebhook({ rawBody, secret }) {
      let event;
      try {
        event = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
      } catch {
        return { ok: false, reason: 'malformed' };
      }
      const token = event.secret_token ?? '';
      if (!secret || !safeEqual(String(token), String(secret)))
        return { ok: false, reason: 'signature' };

      const data = event.data ?? {};
      // Invoice events carry the invoice; payment events carry the charge and its invoice id.
      const gatewayRef = String(data.invoice_id ?? data.id ?? '');
      const status = STATUS[data.status] ?? 'pending';
      return {
        ok: true,
        eventId: String(event.id ?? `${gatewayRef}:${event.type ?? status}`),
        type: String(event.type ?? ''),
        gatewayRef,
        chargeRef: data.invoice_id ? String(data.id) : (data.payments?.[0]?.id ?? null),
        status,
        amount: Number(data.amount ?? 0),
        failureMessage: data.source?.message ?? data.message ?? null,
      };
    },
  };
}
