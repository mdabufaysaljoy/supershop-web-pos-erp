import { CSRF_HEADER } from '@supershop/shared';

/**
 * Browser client for `/api/v1/cart` (same origin: proxied to the API). The guest cart lives in an
 * httpOnly cookie the API sets, so nothing about the cart is stored in JS. Mutations send the
 * CSRF header the API requires. Errors throw `{ code, status, details }`.
 */
export async function cartRequest(method, path, { lang, body } = {}) {
  let res;
  try {
    res = await fetch(`/api/v1/cart${path}?${new URLSearchParams({ lang })}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && { [CSRF_HEADER]: '1' }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
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
