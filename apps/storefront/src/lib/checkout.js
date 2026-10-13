import { CSRF_HEADER } from '@supershop/shared';

/** Where "Buy now" and the cart's checkout button go. */
export const CHECKOUT_PATH = '/checkout';
export const CONFIRMATION_PATH = '/checkout/confirmation';

/**
 * Browser calls to `/api/v1/checkout` (same origin). The cart cookie identifies the cart, so
 * nothing about it is passed from JS. Errors throw `{ code, status, details }`.
 */
export async function checkoutRequest(method, path, { lang, body, idempotencyKey } = {}) {
  let res;
  try {
    res = await fetch(
      `/api/v1/checkout${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams({ lang })}`,
      {
        method,
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          ...(body && { 'Content-Type': 'application/json' }),
          ...(method !== 'GET' && { [CSRF_HEADER]: '1' }),
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
  } catch {
    throw Object.assign(new Error('network'), { code: 'NETWORK_ERROR', status: 0 });
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    throw Object.assign(new Error(e.message ?? 'error'), {
      code: e.code ?? 'INTERNAL_ERROR',
      status: res.status,
      details: e.details,
    });
  }
  return json.data;
}

/** API field paths (`contact.name`, `customFields.gift_note`) → form error keys. */
export const detailsToErrors = (details = []) =>
  Object.fromEntries(details.map((d) => [d.path, d.message]));
