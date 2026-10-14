import { createGoogleProvider } from './google.js';

/**
 * Identity providers for customer sign-in (CLAUDE.md §2.4: adapter + registry). Business code
 * never imports a provider directly — it asks for one by name and gets this interface:
 *   {
 *     name: string,
 *     enabled: boolean,                                  // false → not configured; routes 404
 *     authorizationUrl({ redirectUri, state }): string,
 *     exchange({ code, redirectUri }): Promise<{ sub, email, emailVerified, name }>
 *   }
 * Adding Apple/Facebook later = a file here + a branch below + settings keys.
 */
export const OAUTH_PROVIDERS = Object.freeze(['google']);

/** @param {{ provider: string, clientId?: string, clientSecret?: string, fetchImpl?: typeof fetch }} cfg */
export function createOAuthProvider({ provider, clientId = '', clientSecret = '', fetchImpl }) {
  switch (provider) {
    case 'google':
      return createGoogleProvider({ clientId, clientSecret, fetchImpl });
    default:
      throw new Error(`Unknown OAuth provider "${provider}"`);
  }
}
