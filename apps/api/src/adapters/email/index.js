import { createLogEmailProvider } from './log.js';
import { createSmtpProvider } from './smtp.js';

/**
 * Email adapters (CLAUDE.md §2.4). Business code never talks to a mail service: it asks for the
 * configured provider and gets this interface.
 *
 *   {
 *     name: string,
 *     enabled: boolean,                 // false → nothing is sent (and the module says so)
 *     send({ to, subject, text, html, replyTo }): Promise<{ id: string | null }>
 *   }
 *
 * `log` writes the message to the application log instead of sending it — the default, so a fresh
 * install never silently drops mail it was never configured to send, and local work needs no SMTP.
 */
export const EMAIL_PROVIDERS = Object.freeze(['log', 'smtp']);

/**
 * @param {{ provider: string, from: string, fromName?: string, smtp?: object }} cfg
 * @returns {{ name: string, enabled: boolean, send: Function }}
 */
export function createEmailProvider({ provider, from, fromName, smtp = {} }) {
  switch (provider) {
    case 'smtp':
      return createSmtpProvider({ from, fromName, ...smtp });
    case 'log':
    default:
      return createLogEmailProvider({ from, fromName });
  }
}
