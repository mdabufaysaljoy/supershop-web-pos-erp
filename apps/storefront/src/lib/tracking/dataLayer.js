import { buildDataLayerPayload, generateEventId } from '@supershop/shared';

/**
 * Pushes standard GA4 / GTM ecommerce event to window.dataLayer with event_id deduplication.
 * @param {string} event  Event name (e.g. 'page_view', 'add_to_cart', 'purchase')
 * @param {object} [data={}]
 * @returns {string} The generated or provided eventId
 */
export function pushDataLayerEvent(event, data = {}) {
  if (typeof window === 'undefined') return '';

  window.dataLayer = window.dataLayer || [];

  const eventId = data.eventId || generateEventId();
  const payload = buildDataLayerPayload(event, {
    ...data,
    eventId,
  });

  // Standard GTM e-commerce reset to avoid data pollution between events
  if (payload.ecommerce) {
    window.dataLayer.push({ ecommerce: null });
  }

  window.dataLayer.push(payload);
  return eventId;
}

/**
 * Tracks a page view event.
 * @param {{ path?: string, title?: string, url?: string }} [opts]
 */
export function trackPageView({ path, title, url } = {}) {
  if (typeof window === 'undefined') return '';
  return pushDataLayerEvent('page_view', {
    page_path: path || window.location.pathname,
    page_title: title || document.title,
    page_location: url || window.location.href,
  });
}

/**
 * Tracks viewing a product detail item.
 * @param {{ item: object, currency?: string }} params
 */
export function trackViewItem({ item, currency = 'SAR' }) {
  const value = Number(item.price ?? 0) * Number(item.quantity ?? 1);
  return pushDataLayerEvent('view_item', {
    currency,
    value,
    items: [item],
  });
}

/**
 * Tracks viewing a list of items / catalog category.
 * @param {{ items: object[], listName?: string, currency?: string }} params
 */
export function trackViewItemList({ items = [], listName = 'Category Listing', currency = 'SAR' }) {
  return pushDataLayerEvent('view_item_list', {
    currency,
    item_list_name: listName,
    items,
  });
}

/**
 * Tracks adding item to cart.
 * @param {{ item?: object, items?: object[], currency?: string, value?: number }} params
 */
export function trackAddToCart({ item, items, currency = 'SAR', value } = {}) {
  const itemList = items || (item ? [item] : []);
  const calculatedVal =
    value ??
    itemList.reduce((sum, it) => sum + Number(it.price ?? 0) * Number(it.quantity ?? 1), 0);
  return pushDataLayerEvent('add_to_cart', {
    currency,
    value: calculatedVal,
    items: itemList,
  });
}

/**
 * Tracks removing item from cart.
 * @param {{ item?: object, items?: object[], currency?: string, value?: number }} params
 */
export function trackRemoveFromCart({ item, items, currency = 'SAR', value } = {}) {
  const itemList = items || (item ? [item] : []);
  const calculatedVal =
    value ??
    itemList.reduce((sum, it) => sum + Number(it.price ?? 0) * Number(it.quantity ?? 1), 0);
  return pushDataLayerEvent('remove_from_cart', {
    currency,
    value: calculatedVal,
    items: itemList,
  });
}

/**
 * Tracks viewing cart page.
 * @param {{ items?: object[], currency?: string, value?: number }} params
 */
export function trackViewCart({ items = [], currency = 'SAR', value = 0 } = {}) {
  return pushDataLayerEvent('view_cart', {
    currency,
    value,
    items,
  });
}

/**
 * Tracks beginning checkout step.
 * @param {{ items?: object[], currency?: string, value?: number, coupon?: string }} params
 */
export function trackBeginCheckout({ items = [], currency = 'SAR', value = 0, coupon } = {}) {
  return pushDataLayerEvent('begin_checkout', {
    currency,
    value,
    coupon,
    items,
  });
}

/**
 * Tracks adding shipping info.
 * @param {{ items?: object[], currency?: string, value?: number, shippingTier?: string }} params
 */
export function trackAddShippingInfo({
  items = [],
  currency = 'SAR',
  value = 0,
  shippingTier = 'Standard Delivery',
} = {}) {
  return pushDataLayerEvent('add_shipping_info', {
    currency,
    value,
    shipping_tier: shippingTier,
    items,
  });
}

/**
 * Tracks adding payment info.
 * @param {{ items?: object[], currency?: string, value?: number, paymentType?: string }} params
 */
export function trackAddPaymentInfo({
  items = [],
  currency = 'SAR',
  value = 0,
  paymentType = 'Card',
} = {}) {
  return pushDataLayerEvent('add_payment_info', {
    currency,
    value,
    payment_type: paymentType,
    items,
  });
}

/**
 * Tracks successful order purchase.
 * @param {{
 *   orderNumber: string,
 *   items?: object[],
 *   currency?: string,
 *   value?: number,
 *   tax?: number,
 *   shipping?: number,
 *   coupon?: string,
 *   eventId?: string,
 * }} params
 */
export function trackPurchase({
  orderNumber,
  items = [],
  currency = 'SAR',
  value = 0,
  tax = 0,
  shipping = 0,
  coupon,
  eventId,
} = {}) {
  return pushDataLayerEvent('purchase', {
    transaction_id: orderNumber,
    currency,
    value,
    tax,
    shipping,
    coupon,
    items,
    eventId,
  });
}
