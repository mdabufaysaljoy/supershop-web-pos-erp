import { createLogSmsProvider } from './log.js';
import { createTaqnyatProvider } from './taqnyat.js';
import { createUnifonicProvider } from './unifonic.js';

/**
 * SMS adapters (CLAUDE.md §5.6). One interface, whichever Saudi provider a shop has an account
 * with — the choice is a setting, not a deploy:
 *
 *   {
 *     name: string,
 *     enabled: boolean,
 *     send({ to, text }): Promise<{ id: string | null }>   // `to` is already +9665…
 *   }
 *
 * Both KSA providers are plain REST and are written from their published API shape; verify against
 * a real account before go-live (PROGRESS.md open questions). `log` is the default.
 */
export const SMS_PROVIDERS = Object.freeze(['log', 'unifonic', 'taqnyat']);

/**
 * @param {{ provider: string, apiKey?: string, sender?: string, fetchImpl?: typeof fetch }} cfg
 */
export function createSmsProvider({ provider, apiKey = '', sender = '', fetchImpl }) {
  switch (provider) {
    case 'unifonic':
      return createUnifonicProvider({ appSid: apiKey, sender, fetchImpl });
    case 'taqnyat':
      return createTaqnyatProvider({ bearerToken: apiKey, sender, fetchImpl });
    case 'log':
    default:
      return createLogSmsProvider();
  }
}
