import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { PRINCIPAL_TYPES } from '@supershop/shared';
import { setRefreshCookie } from './auth.cookies.js';
import { requestContext } from './auth.controller.js';
import {
  completeOAuth,
  OAUTH_STATE_COOKIE,
  startOAuth,
  storefrontUrl,
  safeReturnTo,
} from './oauth.service.js';

/**
 * Browser-facing half of OAuth sign-in. Everything the customer sees is a redirect back to the
 * storefront; failures land on the sign-in page with a generic `?error=` (no provider internals).
 */
const TYPE = PRINCIPAL_TYPES.CUSTOMER;
const FAILURE_PATH = '/account/login?error=signin';

/**
 * The state cookie must survive a top-level redirect from the provider, so SameSite=Lax (Strict
 * would not be sent on that navigation). It is short-lived and scoped to this provider's routes.
 */
const stateCookieOptions = (provider, maxAge) => ({
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  path: `/api/v1/auth/${TYPE}/${provider}`,
  ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  ...(maxAge ? { maxAge } : {}),
});

export const start = (provider, deps) => async (req, res) => {
  const { url, state, returnTo, maxAge } = startOAuth(
    provider,
    { returnTo: req.valid.query.returnTo },
    deps,
  );
  res.cookie(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, returnTo }),
    stateCookieOptions(provider, maxAge),
  );
  res.set('Cache-Control', 'no-store');
  res.redirect(302, url);
};

const readStateCookie = (req) => {
  try {
    const parsed = JSON.parse(req.cookies?.[OAUTH_STATE_COOKIE] ?? '{}');
    return { state: parsed.state ?? null, returnTo: safeReturnTo(parsed.returnTo) ?? '/account' };
  } catch {
    return { state: null, returnTo: '/account' };
  }
};

export const callback = (provider, deps) => async (req, res) => {
  const { state: expectedState, returnTo } = readStateCookie(req);
  res.clearCookie(OAUTH_STATE_COOKIE, stateCookieOptions(provider));
  res.set('Cache-Control', 'no-store');

  if (req.valid.query.error) return res.redirect(302, storefrontUrl(FAILURE_PATH));
  try {
    const { tokens } = await completeOAuth(
      TYPE,
      provider,
      { code: req.valid.query.code, state: req.valid.query.state, expectedState },
      requestContext(req),
      deps,
    );
    setRefreshCookie(res, TYPE, tokens.refreshToken, tokens.refreshExpiresAt);
    // The storefront exchanges the refresh cookie for an access token on load — nothing in the URL.
    return res.redirect(302, storefrontUrl(returnTo));
  } catch (err) {
    logger.warn({ err: { message: err.message }, provider }, 'oauth sign-in failed');
    return res.redirect(302, storefrontUrl(FAILURE_PATH));
  }
};
