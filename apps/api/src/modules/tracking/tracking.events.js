import { EVENTS, generateEventId } from '@supershop/shared';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { enqueueTrackingEvent } from './tracking.jobs.js';
import * as repo from './tracking.repo.js';

let registered = false;
let resolveOrder = null;

/**
 * Registers domain event subscribers for server-side marketing tracking dispatches.
 *
 * @param {object} [providers]
 * @param {(orderId: string) => Promise<object|null>} [providers.getOrder] Resolver for order details
 */
export function registerTrackingSubscribers({ getOrder } = {}) {
  if (getOrder) resolveOrder = getOrder;
  if (registered) return;
  registered = true;

  // On order paid or created (e-commerce purchase)
  const onOrderPurchase = async (event) => {
    const payload = event?.payload ?? event;
    try {
      const orderId = payload.orderId;
      if (!orderId || !resolveOrder) return;

      const order = await resolveOrder(orderId);
      if (!order) return;

      const orderNumber = order.orderNo;
      const attribution = order.attribution || {};
      const eventId = attribution.eventId || `ord_${orderNumber}`;
      const totalAmount =
        typeof order.totals?.total === 'number'
          ? order.totals.total / 100
          : Number(order.totals?.total) || 0;

      const items = (order.items || []).map((i) => ({
        item_id: String(i.sku || i.productId || ''),
        item_name: String(i.name || ''),
        price: typeof i.price === 'number' ? i.price / 100 : 0,
        quantity: Number(i.qty || i.quantity) || 1,
      }));

      const eventPayload = {
        event: 'purchase',
        eventId,
        orderNumber,
        value: totalAmount,
        currency: order.currency || 'SAR',
        items,
        customer: {
          email: order.customer?.email,
          phone: order.customer?.phone,
          name: order.customer?.name,
        },
        attribution,
      };

      const integrations = await repo.listIntegrations();
      const activeProviders = integrations
        .filter((i) => i.enabled && (i.events || []).includes('purchase'))
        .map((i) => i.provider);

      for (const provider of activeProviders) {
        void enqueueTrackingEvent({
          provider,
          event: 'purchase',
          eventId,
          orderNumber,
          payload: eventPayload,
        });
      }
    } catch (err) {
      logger.error(
        { err: { message: err.message }, orderId: payload.orderId },
        'tracking onOrderPurchase failed',
      );
    }
  };

  eventBus.on(EVENTS.ORDER_PAID, onOrderPurchase);
  eventBus.on(EVENTS.ORDER_CREATED, (event) => {
    const payload = event?.payload ?? event;
    // If order was created with cash or COD, it's considered placed/purchased
    if (payload.paymentMethod === 'cash' || payload.paymentMethod === 'cod') {
      void onOrderPurchase(event);
    }
  });

  // On order refund
  const onOrderRefund = async (event) => {
    const payload = event?.payload ?? event;
    try {
      const orderId = payload.orderId;
      if (!orderId || !resolveOrder) return;

      const order = await resolveOrder(orderId);
      if (!order) return;

      const orderNumber = order.orderNo;
      const eventId = `ref_${orderNumber}_${Date.now()}`;
      const totalAmount =
        typeof order.totals?.total === 'number'
          ? order.totals.total / 100
          : Number(order.totals?.total) || 0;

      const eventPayload = {
        event: 'refund',
        eventId,
        orderNumber,
        value: totalAmount,
        currency: order.currency || 'SAR',
        customer: {
          email: order.customer?.email,
          phone: order.customer?.phone,
        },
      };

      const integrations = await repo.listIntegrations();
      const activeProviders = integrations
        .filter((i) => i.enabled && (i.events || []).includes('refund'))
        .map((i) => i.provider);

      for (const provider of activeProviders) {
        void enqueueTrackingEvent({
          provider,
          event: 'refund',
          eventId,
          orderNumber,
          payload: eventPayload,
        });
      }
    } catch (err) {
      logger.error(
        { err: { message: err.message }, orderId: payload.orderId },
        'tracking onOrderRefund failed',
      );
    }
  };

  eventBus.on(EVENTS.ORDER_REFUNDED, onOrderRefund);
  eventBus.on(EVENTS.PAYMENT_REFUNDED, onOrderRefund);

  // On customer registered (sign_up)
  eventBus.on(EVENTS.CUSTOMER_REGISTERED, async (event) => {
    const payload = event?.payload ?? event;
    try {
      const customerId = payload.customerId || payload.id;
      const eventId = `reg_${customerId || generateEventId()}`;

      const eventPayload = {
        event: 'sign_up',
        eventId,
        customer: {
          email: payload.email,
          phone: payload.phone,
          name: payload.name,
        },
      };

      const integrations = await repo.listIntegrations();
      const activeProviders = integrations
        .filter((i) => i.enabled && (i.events || []).includes('sign_up'))
        .map((i) => i.provider);

      for (const provider of activeProviders) {
        void enqueueTrackingEvent({
          provider,
          event: 'sign_up',
          eventId,
          payload: eventPayload,
        });
      }
    } catch (err) {
      logger.error(
        { err: { message: err.message }, customerId: payload.customerId },
        'tracking onCustomerRegistered failed',
      );
    }
  });
}
