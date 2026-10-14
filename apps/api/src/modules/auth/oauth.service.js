import { randomBytes } from 'node:crypto';
import { createOAuthProvider } from '../../adapters/oauth/index.js';
import { config } from '../../core/config.js';
import { BadRequestError, NotFoundError, UnauthenticatedError } from '../../core/errors.js';
import { principalAdapter } from './principals.js';
import { issueSession } from './auth.service.js';

/**
 * Sign in with an identity provider (P3.5, Google first). The browser is redirected to the
 * provider and comes back to `/callback`; the provider talks only to the API, never to the SPA, so
 * no token is ever put in a URL. The storefront picks the session up with its normal refresh call.
 *
 * Trust rules:
 * - an account is matched by the provider's stable `sub`, or by an email the provider VERIFIED;
 * - an unverified email is refused (it would let anyone claim someone else's account);
 * - `returnTo` must be a path on our own site.
 */
export const OAUTH_STATE_COOKIE = 'ss_oauth_state';
const STATE_TTL_MS = 10 * 60_000;

/**
 * Provider credentials come from settings, injected by the composition root so this module keeps
 * its one-way dependencies (like the auth policy, D-023).
 * @type {(provider: string) => { enabled: boolean, clientId: string, clientSecret: string }}
 */
let settingsFor = () => ({ enabled: false, clientId: '', clientSecret: '' });

/** @param {typeof settingsFor} provider */
export const setOAuthSettingsProvider = (fn) => {
  settingsFor = fn;
};

/** Where the provider sends the browser back: the storefront origin, which proxies /api to us. */
export const redirectUriFor = (provider) =>
  `${config.STOREFRONT_URL.replace(/\/+$/, '')}/api/v1/auth/customer/${provider}/callback`;

/** @returns {{ name: string, enabled: boolean, authorizationUrl: Function, exchange: Function }} */
export function oauthProvider(provider, { fetchImpl } = {}) {
  const { enabled, clientId, clientSecret } = settingsFor(provider);
  if (!enabled) throw new NotFoundError('Sign-in provider is not enabled');
  const adapter = createOAuthProvider({ provider, clientId, clientSecret, fetchImpl });
  if (!adapter.enabled) throw new NotFoundError('Sign-in provider is not configured');
  return adapter;
}

/** A relative path on this site, or null. Blocks `//evil.com` and absolute URLs (open redirect). */
export const safeReturnTo = (value) =>
  typeof value === 'string' && /^\/(?!\/)[\w\-./?=&%+#]*$/.test(value) && value.length <= 512
    ? value
    : null;

export const storefrontUrl = (path) => `${config.STOREFRONT_URL.replace(/\/+$/, '')}${path}`;

/**
 * Step 1: the URL to send the browser to, plus the state to remember in a cookie.
 * @returns {{ url: string, state: string, returnTo: string }}
 */
export function startOAuth(provider, { returnTo }, { fetchImpl } = {}) {
  const adapter = oauthProvider(provider, { fetchImpl });
  const state = randomBytes(32).toString('base64url');
  const target = safeReturnTo(returnTo) ?? '/account';
  return {
    url: adapter.authorizationUrl({ redirectUri: redirectUriFor(provider), state }),
    state,
    returnTo: target,
    maxAge: STATE_TTL_MS,
  };
}

/**
 * Step 2: the provider sent the browser back. Verifies the state, exchanges the code and issues
 * our own session for the matched (or newly created) customer.
 * @returns {Promise<{ tokens: object, profile: object, created: boolean }>}
 */
export async function completeOAuth(
  type,
  provider,
  { code, state, expectedState },
  ctx = {},
  { fetchImpl } = {},
) {
  if (!code || !state || !expectedState || state !== expectedState)
    throw new BadRequestError('Sign-in could not be completed');

  const adapter = oauthProvider(provider, { fetchImpl });
  const identity = await adapter.exchange({ code, redirectUri: redirectUriFor(provider) });
  if (!identity.email || !identity.emailVerified)
    throw new UnauthenticatedError('Your provider did not confirm your email address');

  const principals = principalAdapter(type);
  if (!principals.findOrCreateFromOAuth)
    throw new NotFoundError('Sign-in provider is not available here');

  const { principalId, profile, created } = await principals.findOrCreateFromOAuth(
    { provider, ...identity },
    ctx,
  );
  const tokens = await issueSession(type, principalId, ctx);
  return { tokens, profile, created };
}
