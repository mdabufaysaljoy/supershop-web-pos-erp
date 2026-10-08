import { EVENTS, PRINCIPAL_TYPES } from '@supershop/shared';
import { config } from '../../core/config.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';

/**
 * Auth event subscribers.
 * Until transactional email exists (P4.5), DEVELOPMENT ONLY logs the reset/verify links so the
 * flows can be tested locally. Never enabled outside NODE_ENV=development (tokens are secrets).
 * P4.5 adds the real subscribers that enqueue emails.
 */
export function registerAuthSubscribers() {
  if (!config.isDev) return;

  const appUrl = (type) =>
    type === PRINCIPAL_TYPES.STAFF ? config.ADMIN_URL : config.STOREFRONT_URL;
  const devLink = (path) => (event) => {
    const { principalType, token } = event.payload;
    const link = `${appUrl(principalType)}${path}?token=${encodeURIComponent(token)}`;
    logger.warn({ principalType, link }, `DEV ONLY (email not configured): ${event.name}`);
  };

  eventBus.on(EVENTS.AUTH_PASSWORD_RESET_REQUESTED, devLink('/reset-password'));
  eventBus.on(EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED, devLink('/verify-email'));
}
