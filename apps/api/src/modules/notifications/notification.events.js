import { EVENTS, PRINCIPAL_TYPES, SOURCE_LANGUAGE } from '@supershop/shared';
import { config } from '../../core/config.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { createFormatters } from '@supershop/shared';
import { getSetting } from '../settings/index.js';
import { queueNotification } from './notification.jobs.js';
import { trackUrl } from './notification.service.js';

/**
 * What the shop tells its customers, and when (P4.5). Subscribers only — the order service knows
 * nothing about mail (CLAUDE.md §2.2), so adding a message is a template plus a line here.
 *
 * Every message is sent in the ORDER's language: a customer who bought in Arabic is answered in
 * Arabic, whatever language the staff member who shipped it uses.
 */
const money = (minor, lang) =>
  createFormatters({
    lang,
    currency: getSetting('store.currency'),
    digits: 'latn',
    timeZone: getSetting('store.timeZone'),
  }).money(minor);

/** The variables every order template may use. */
const orderVars = (order) => ({
  store: { name: getSetting('store.name') },
  customer: { name: order.customer?.name ?? '' },
  order: {
    number: order.orderNo,
    total: money(order.totals?.total ?? 0, order.lang),
    status: order.status,
    trackUrl: trackUrl(order.orderNo, order.lang),
  },
  shipment: {
    carrier: order.shipment?.carrier ?? '',
    trackingNumber: order.shipment?.trackingNumber ?? '',
  },
});

/** Both channels, when the shop has a way to reach the customer. */
function notifyAboutOrder(event, order, { dedupe } = {}) {
  const vars = orderVars(order);
  const base = {
    event,
    lang: order.lang ?? SOURCE_LANGUAGE,
    vars,
    orderId: String(order.id ?? order._id ?? ''),
    dedupe,
  };
  if (order.customer?.email)
    void queueNotification({ ...base, channel: 'email', to: order.customer.email });
  if (order.customer?.phone)
    void queueNotification({ ...base, channel: 'sms', to: order.customer.phone });
}

let registered = false;

/**
 * @param {{
 *   getOrder: (id: string) => Promise<object | null>,
 *   getRecipient: (type: string, id: string) => Promise<{ name?: string, email?: string, lang?: string } | null>,
 * }} deps injected in modules/index.js — notifications never import orders, customers or staff
 *   directly (one direction, no cycles).
 */
export function registerNotificationSubscribers({ getOrder, getRecipient }) {
  if (registered) return;
  registered = true;

  const onOrderEvent = (name, event) =>
    eventBus.on(name, async (e) => {
      try {
        const order = await getOrder(e.payload.orderId);
        if (order) notifyAboutOrder(event, order, { dedupe: `${e.payload.orderId}:${event}` });
      } catch (err) {
        logger.error({ err: { message: err.message }, event: name }, 'order notification failed');
      }
    });

  onOrderEvent(EVENTS.ORDER_CREATED, 'order.placed');
  onOrderEvent(EVENTS.ORDER_PAID, 'order.paid');
  onOrderEvent(EVENTS.ORDER_SHIPPED, 'order.shipped');
  onOrderEvent(EVENTS.ORDER_DELIVERED, 'order.delivered');
  onOrderEvent(EVENTS.ORDER_CANCELLED, 'order.cancelled');
  onOrderEvent(EVENTS.ORDER_REFUNDED, 'order.refunded');

  /**
   * Account mail. The one-time token travels in the event (D-024): it is put straight into the
   * link and never logged. Staff links point at the admin, customers' at the storefront.
   */
  const authLink = (event, paths) => async (e) => {
    const { principalType, principalId, token } = e.payload;
    try {
      const person = await getRecipient(principalType, principalId);
      if (!person?.email) return;
      const staff = principalType === PRINCIPAL_TYPES.STAFF;
      const base = (staff ? config.ADMIN_URL : config.STOREFRONT_URL).replace(/\/+$/, '');
      const lang = staff ? SOURCE_LANGUAGE : (person.lang ?? SOURCE_LANGUAGE);
      const prefix = !staff && lang !== SOURCE_LANGUAGE ? `/${lang}` : '';
      void queueNotification({
        event,
        channel: 'email',
        to: person.email,
        lang,
        dedupe: `${principalId}:${token.slice(0, 8)}`,
        vars: {
          store: { name: getSetting('store.name') },
          customer: { name: person.name ?? '' },
          link: `${base}${prefix}${staff ? paths.staff : paths.customer}?token=${encodeURIComponent(token)}`,
        },
      });
    } catch (err) {
      logger.error({ err: { message: err.message }, event: e.name }, 'account email failed');
    }
  };
  eventBus.on(
    EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED,
    authLink('auth.verifyEmail', { customer: '/account/verify-email', staff: '/verify-email' }),
  );
  eventBus.on(
    EVENTS.AUTH_PASSWORD_RESET_REQUESTED,
    authLink('auth.resetPassword', {
      customer: '/account/reset-password',
      staff: '/reset-password',
    }),
  );
}

/** Tests build fresh app instances. */
export const resetNotificationSubscribers = () => {
  registered = false;
};
