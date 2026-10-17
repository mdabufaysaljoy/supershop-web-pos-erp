/** Loyalty module — public API. */
export { createLoyaltyRouter } from './loyalty.routes.js';
export { createAccountLoyaltyRouter } from './account.routes.js';
export { registerLoyaltySubscribers } from './loyalty.events.js';
export {
  adjustPoints,
  earnPointsForOrder,
  expirePoints,
  getCustomerLoyaltySummary,
  getOrCreateAccount,
  listCustomerLedger,
  lookupMembership,
  quoteRedemption,
  redeemPoints,
  reversePointsForReturn,
  toLoyaltyAccountDto,
  toLoyaltyLedgerDto,
} from './loyalty.service.js';
export { LoyaltyAccount, LoyaltyLedger } from './loyalty.model.js';
