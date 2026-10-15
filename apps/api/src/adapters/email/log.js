import { logger } from '../../core/logger.js';

/**
 * Writes the message to the log instead of sending it. The default provider: a shop that has not
 * configured mail yet still sees exactly what it WOULD have sent, and local development needs no
 * SMTP server. Bodies are logged in development only — they carry names and order details.
 */
export function createLogEmailProvider({ from, fromName }) {
  return {
    name: 'log',
    enabled: true,
    async send({ to, subject, text }) {
      logger.info(
        { to, subject, from: fromName ? `${fromName} <${from}>` : from, body: text },
        'email (not sent: provider is "log")',
      );
      return { id: null };
    },
  };
}
