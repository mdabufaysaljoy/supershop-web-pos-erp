/** Badge tone per purchase order status. */
export const PO_STATUS_TONE = {
  draft: 'muted',
  ordered: 'warn',
  partially_received: 'warn',
  received: 'ok',
  closed: 'muted',
  cancelled: 'bad',
};

/** "Red / M" from a variant summary's option values (English source). */
export const optionLabel = (variant) =>
  (variant?.options ?? [])
    .map((o) => o.value?.en)
    .filter(Boolean)
    .join(' / ');
