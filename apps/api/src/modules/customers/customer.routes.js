import express from 'express';
import { createAuthSchemas } from '@supershop/shared';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as c from './customer.controller.js';

/**
 * Mounted at `/api/v1/customers`.
 *  POST /register   public, rate-limited → 201 + session (same shape as login)
 * Profile/addresses/orders endpoints arrive in P3.5.
 */
const defaultSchemas = createAuthSchemas();

/** @param {{ getSchemas?: () => ReturnType<typeof createAuthSchemas> }} [opts] settings-aware schemas */
export function createCustomerRouter({ getSchemas = () => defaultSchemas } = {}) {
  const r = express.Router();
  r.post(
    '/register',
    createRateLimiter({ name: 'customer-register', ...LIMITS.register, failClosed: true }),
    validate({ body: () => getSchemas().customerRegister }),
    c.register,
  );
  return r;
}
