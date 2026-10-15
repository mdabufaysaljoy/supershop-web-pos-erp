import { logger } from '../../core/logger.js';

/** Writes the message to the log instead of sending it (default, and what tests use). */
export function createLogSmsProvider() {
  return {
    name: 'log',
    enabled: true,
    async send({ to, text }) {
      logger.info({ to, text }, 'sms (not sent: provider is "log")');
      return { id: null };
    },
  };
}
