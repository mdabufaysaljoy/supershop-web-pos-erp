/** Customers module — public API. */
export { createAccountRouter } from './account.routes.js';
export { createCustomerRouter } from './customer.routes.js';
export {
  customerPrincipal,
  findCustomerByContact,
  findOrCreateCustomerFromOAuth,
  getCustomerDetailForAdmin,
  getCustomerSegmentsSummary,
  listCustomersForAdmin,
  registerCustomer,
  toCustomerProfile,
  updateCustomerByAdmin,
} from './customer.service.js';
export {
  countAudienceForCampaign,
  findAudienceForCampaign,
  findCustomerByEmail,
  findCustomerById,
  findCustomerByPhone,
  setCustomerMarketingOptOut,
} from './customer.repo.js';
