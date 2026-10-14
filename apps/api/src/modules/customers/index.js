/** Customers module — public API. */
export { createAccountRouter } from './account.routes.js';
export { createCustomerRouter } from './customer.routes.js';
export {
  customerPrincipal,
  findOrCreateCustomerFromOAuth,
  registerCustomer,
  toCustomerProfile,
} from './customer.service.js';
