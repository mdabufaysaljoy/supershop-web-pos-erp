import { ServiceUnavailableError } from '../../core/errors.js';

/**
 * Google as an OpenID Connect provider. No SDK: three documented HTTPS endpoints.
 * The profile is read from `userinfo` with the access token we just received over TLS from
 * Google's own token endpoint, so no JWT signature verification is needed on our side.
 */
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const TIMEOUT_MS = 8000;

const unavailable = (detail) =>
  new ServiceUnavailableError(`Google sign-in is unavailable (${detail})`);

/**
 * @param {{ clientId: string, clientSecret: string, fetchImpl?: typeof fetch }} cfg
 */
export function createGoogleProvider({ clientId, clientSecret, fetchImpl = fetch }) {
  const call = async (url, init) => {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw unavailable('network');
    }
  };

  return {
    name: 'google',
    enabled: Boolean(clientId && clientSecret),

    /** Where the browser is sent to sign in. `state` is checked again on the way back. */
    authorizationUrl({ redirectUri, state }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        // Always ask which account to use: shared devices are common in retail.
        prompt: 'select_account',
      });
      return `${AUTHORIZE_URL}?${params}`;
    },

    /**
     * Authorization code → the person's Google identity.
     * @returns {Promise<{ sub: string, email: string | null, emailVerified: boolean, name: string | null }>}
     */
    async exchange({ code, redirectUri }) {
      const tokenRes = await call(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw unavailable(`token ${tokenRes.status}`);
      const { access_token: accessToken } = (await tokenRes.json().catch(() => ({}))) ?? {};
      if (!accessToken) throw unavailable('token response');

      const infoRes = await call(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!infoRes.ok) throw unavailable(`userinfo ${infoRes.status}`);
      const info = (await infoRes.json().catch(() => ({}))) ?? {};
      if (!info.sub) throw unavailable('userinfo response');
      return {
        sub: String(info.sub),
        email: info.email ? String(info.email).toLowerCase() : null,
        emailVerified: info.email_verified === true,
        name: info.name ? String(info.name) : null,
      };
    },
  };
}
