/** Customers module — public API. */
export { createAccountRouter } from './account.routes.js';
export { createCustomerRouter } from './customer.routes.js';
export {
  customerPrincipal,
  findCustomerByContact,
  findOrCreateCustomerFromOAuth,
  registerCustomer,
  toCustomerProfile,
} from './customer.service.js';
export { findCustomerByEmail, findCustomerById, findCustomerByPhone } from './customer.repo.js';
