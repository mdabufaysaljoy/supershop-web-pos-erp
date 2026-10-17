import express from 'express';
import { createAuthSchemas, createCustomerAdminSchemas, PERMISSIONS as P } from '@supershop/shared';
import { requirePermission } from '../../middleware/authorize.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './customer.controller.js';

/**
 * Mounted at `/api/v1/customers`.
 *  POST  /register   public, rate-limited → 201 + session (same shape as login)
 *  GET   /           staff (customer.view) → paginated list with metrics + segments
 *  GET   /segments   staff (customer.view) → summary counts per segment
 *  GET   /:id        staff (customer.view) → detailed customer profile + metrics + loyalty + orders
 *  PATCH /:id        staff (customer.manage) → update customer details / status
 */
const defaultSchemas = createAuthSchemas();
const defaultAdminSchemas = createCustomerAdminSchemas();

/**
 * @param {{
 *   getSchemas?: () => ReturnType<typeof createAuthSchemas>,
 *   getAdminSchemas?: () => ReturnType<typeof createCustomerAdminSchemas>
 * }} [opts] settings-aware schemas
 */
export function createCustomerRouter({
  getSchemas = () => defaultSchemas,
  getAdminSchemas = () => defaultAdminSchemas,
} = {}) {
  const r = express.Router();

  // Public customer registration
  r.post(
    '/register',
    createRateLimiter({ name: 'customer-register', ...LIMITS.register, failClosed: true }),
    validate({ body: () => getSchemas().customerRegister }),
    c.register,
  );

  // Staff admin customer views
  r.get(
    '/',
    ...requirePermission(P.CUSTOMER_VIEW),
    validate({ query: () => getAdminSchemas().listQuery }),
    c.adminList,
  );

  r.get('/segments', ...requirePermission(P.CUSTOMER_VIEW), c.getSegments);

  r.get(
    '/:id',
    ...requirePermission(P.CUSTOMER_VIEW),
    validate({ params: () => getAdminSchemas().idParam }),
    c.adminGet,
  );

  r.patch(
    '/:id',
    ...requirePermission(P.CUSTOMER_MANAGE),
    validate({
      params: () => getAdminSchemas().idParam,
      body: () => getAdminSchemas().updateCustomer,
    }),
    c.adminUpdate,
  );

  return r;
}
