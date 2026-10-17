/** Badge tones for customer segments, status, and loyalty tiers. */
export const CUSTOMER_SEGMENT_TONE = Object.freeze({
  vip: 'ok',
  loyal: 'ok',
  active: 'info',
  new: 'info',
  slipping: 'warn',
  churn_risk: 'bad',
  idle: 'muted',
});

export const LOYALTY_TIER_TONE = Object.freeze({
  bronze: 'muted',
  silver: 'info',
  gold: 'warn',
  platinum: 'ok',
});

export const CUSTOMER_STATUS_TONE = Object.freeze({
  active: 'ok',
  disabled: 'bad',
});

export const LEDGER_TYPE_TONE = Object.freeze({
  earn: 'ok',
  redeem: 'warn',
  reverse: 'bad',
  adjust: 'info',
  expire: 'muted',
});
