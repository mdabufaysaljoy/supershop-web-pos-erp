import { EVENTS, PRINCIPAL_TYPES } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { linkOrdersToCustomer } from './order.history.js';

/**
 * Side effects owned by the orders module (CLAUDE.md §2.2).
 *
 * A customer who checked out as a guest and later proves that email (verification link, or an
 * identity provider that vouches for it) gets those orders in their history. Proof is required:
 * matching an email on sign-up alone would hand a stranger someone else's order history.
 */
let registered = false;

/** @param {{ resolveCustomerEmail: (id: string) => Promise<string | null> }} deps injected in modules/index.js */
export function registerOrderSubscribers({ resolveCustomerEmail }) {
  if (registered) return;
  registered = true;

  eventBus.on(EVENTS.AUTH_EMAIL_VERIFIED, async (event) => {
    const { principalType, principalId } = event.payload ?? {};
    if (principalType !== PRINCIPAL_TYPES.CUSTOMER || !principalId) return;
    try {
      const email = await resolveCustomerEmail(principalId);
      const linked = await linkOrdersToCustomer(email, principalId);
      if (linked) logger.info({ customerId: principalId, linked }, 'guest orders linked');
    } catch (err) {
      logger.error({ err: { message: err.message } }, 'linking guest orders failed');
    }
  });
}

/** Tests build fresh app instances; let them re-register. */
export const resetOrderSubscribers = () => {
  registered = false;
};
