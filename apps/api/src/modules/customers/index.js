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
export { findCustomerByEmail, findCustomerById, findCustomerByPhone } from './customer.repo.js';
