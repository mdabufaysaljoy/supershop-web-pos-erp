/** Colour for each lifecycle state — one place, so the list, the detail and the badge agree. */
export const ORDER_STATUS_TONE = Object.freeze({
  pending: 'warn',
  paid: 'ok',
  cod_confirmed: 'ok',
  processing: 'info',
  shipped: 'info',
  delivered: 'ok',
  completed: 'ok',
  cancelled: 'muted',
  refunded: 'bad',
  partially_returned: 'warn',
  exchanged: 'warn',
});

export const PAYMENT_STATUS_TONE = Object.freeze({
  pending: 'warn',
  authorized: 'info',
  paid: 'ok',
  failed: 'bad',
  refunded: 'muted',
});
