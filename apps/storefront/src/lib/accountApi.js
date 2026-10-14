import { CSRF_HEADER } from '@supershop/shared';

/**
 * Browser calls for customer accounts (P3.5), same origin (Next proxies `/api/v1` to the API).
 * The access token lives in memory only (never localStorage); the refresh token is an httpOnly
 * cookie the API sets, so a signed-in visitor survives a reload without JS ever holding it.
 * Errors throw `{ code, status, details }`, like the cart and checkout clients.
 */
export const AUTH_BASE = '/api/v1/auth/customer';
export const ACCOUNT_BASE = '/api/v1/account';

/** Account URLs, in the default language; `localizePath` adds `/ar` where needed. */
export const ACCOUNT_PATHS = Object.freeze({
  home: '/account',
  login: '/account/login',
  register: '/account/register',
  forgot: '/account/forgot-password',
  reset: '/account/reset-password',
  addresses: '/account/addresses',
  orders: '/account/orders',
});

export async function apiRequest(method, path, { token, body, lang, signal } = {}) {
  let res;
  try {
    res = await fetch(lang ? `${path}${path.includes('?') ? '&' : '?'}lang=${lang}` : path, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body && { 'Content-Type': 'application/json' }),
        ...(method !== 'GET' && { [CSRF_HEADER]: '1' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'NETWORK_ERROR', status: 0 });
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    throw Object.assign(new Error(e.message ?? 'error'), {
      code: e.code ?? 'INTERNAL_ERROR',
      status: res.status,
      details: e.details,
    });
  }
  return json?.data ?? null;
}

/** Field errors from the API (`{ path, message }[]`) → `{ [path]: message }` for the form. */
export const detailsToErrors = (details = []) =>
  Object.fromEntries((details ?? []).map((d) => [d.path, d.message]));
