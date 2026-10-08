/**
 * Domain event names (CLAUDE.md §2.2). Services emit these after commit; subscribers in other
 * modules react. One place for names = no typos and a visible map of who can react to what.
 * Adding an event = add it here. Payloads are documented next to the emitter.
 */
export const EVENTS = Object.freeze({
  // auth / users
  STAFF_LOGGED_IN: 'staff.loggedIn',
  STAFF_LOGIN_FAILED: 'staff.loginFailed',
  STAFF_CREATED: 'staff.created',
  CUSTOMER_REGISTERED: 'customer.registered',
  CUSTOMER_LOGGED_IN: 'customer.loggedIn',
  ROLE_UPDATED: 'role.updated',

  // settings / content
  SETTINGS_UPDATED: 'settings.updated',
  PAGE_PUBLISHED: 'page.published',
  TRANSLATION_REQUESTED: 'translation.requested',
  TRANSLATION_COMPLETED: 'translation.completed',

  // catalog
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_PRICE_CHANGED: 'product.priceChanged',

  // inventory
  STOCK_MOVED: 'stock.moved',
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',

  // cart / checkout / orders
  CART_UPDATED: 'cart.updated',
  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  ORDER_COD_CONFIRMED: 'order.codConfirmed',
  ORDER_STATUS_CHANGED: 'order.statusChanged',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_COMPLETED: 'order.completed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_REFUNDED: 'order.refunded',

  // payments
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',

  // POS / shifts / returns
  POS_SALE_COMPLETED: 'pos.saleCompleted',
  SHIFT_OPENED: 'shift.opened',
  SHIFT_CLOSED: 'shift.closed',
  RETURN_COMPLETED: 'return.completed',
  EXCHANGE_COMPLETED: 'exchange.completed',

  // loyalty / campaigns
  LOYALTY_EARNED: 'loyalty.earned',
  LOYALTY_REDEEMED: 'loyalty.redeemed',
  LOYALTY_REVERSED: 'loyalty.reversed',
  CAMPAIGN_SENT: 'campaign.sent',
});

const KNOWN = new Set(Object.values(EVENTS));

/** @param {unknown} name */
export const isEventName = (name) => typeof name === 'string' && KNOWN.has(name);
