import { createMoyasarProvider } from './moyasar.js';
import { createStripeProvider } from './stripe.js';

/**
 * Payment gateway adapters (CLAUDE.md §2.4). Business code never imports a gateway SDK and never
 * sees a vendor name: it asks the registry for the configured provider and gets this interface.
 *
 *   {
 *     name: string,
 *     enabled: boolean,                       // false → not configured; "card" stays unavailable
 *     createCheckout({ orderNo, amount, currency, description, callbackUrl, metadata })
 *        → { gatewayRef, status, redirectUrl }      amount is MINOR units (halalas)
 *     fetchPayment(gatewayRef)
 *        → { gatewayRef, status, amount, paidAmount, failureMessage }
 *     refund({ gatewayRef, amount }) → { refundRef, status, amount }
 *     parseWebhook({ rawBody, headers, secret })
 *        → { ok, eventId, type, gatewayRef, status, amount, failureMessage }
 *   }
 *
 * `status` is always one of PAYMENT.STATUSES — each adapter maps its gateway's vocabulary.
 * Adding a gateway = a file here + a branch below + an enum value in `payments.gateway`.
 */
export const PAYMENT_GATEWAYS = Object.freeze(['moyasar', 'stripe']);

/**
 * @param {{ provider: string, secretKey?: string, fetchImpl?: typeof fetch, baseUrl?: string }} cfg
 * @returns {object | null} null when no gateway is configured (COD-only shop)
 */
export function createPaymentProvider({ provider, secretKey = '', fetchImpl, baseUrl }) {
  switch (provider) {
    case 'moyasar':
      return createMoyasarProvider({ secretKey, fetchImpl, baseUrl });
    case 'stripe':
      return createStripeProvider({ secretKey, fetchImpl, baseUrl });
    case 'none':
    case '':
    case undefined:
      return null;
    default:
      throw new Error(`Unknown payment gateway "${provider}"`);
  }
}
