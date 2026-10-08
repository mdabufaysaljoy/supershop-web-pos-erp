/**
 * Marketing tracking event dictionary (CLAUDE.md §5.5) — GA4 recommended-event names, used for the
 * client `dataLayer` push AND the server-side dispatch (GA4 MP, Meta CAPI, Google Ads) with the
 * same `event_id` for deduplication. Platform-specific name mapping lives in the tracking adapters.
 */
export const TRACKING_EVENTS = Object.freeze({
  PAGE_VIEW: 'page_view',
  VIEW_ITEM_LIST: 'view_item_list',
  VIEW_ITEM: 'view_item',
  SEARCH: 'search',
  ADD_TO_CART: 'add_to_cart',
  REMOVE_FROM_CART: 'remove_from_cart',
  VIEW_CART: 'view_cart',
  BEGIN_CHECKOUT: 'begin_checkout',
  ADD_SHIPPING_INFO: 'add_shipping_info',
  ADD_PAYMENT_INFO: 'add_payment_info',
  PURCHASE: 'purchase',
  REFUND: 'refund',
  SIGN_UP: 'sign_up',
  LOGIN: 'login',
  GENERATE_LEAD: 'generate_lead',
});

const KNOWN = new Set(Object.values(TRACKING_EVENTS));

/** @param {unknown} name */
export const isTrackingEvent = (name) => typeof name === 'string' && KNOWN.has(name);
