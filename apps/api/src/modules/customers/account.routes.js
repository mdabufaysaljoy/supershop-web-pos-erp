import express from 'express';
import { createAccountSchemas, PRINCIPAL_TYPES } from '@supershop/shared';
import { requireCsrfProtection } from '../../middleware/csrf.js';
import { createRateLimiter, LIMITS } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import * as c from './account.controller.js';

/**
 * Mounted at `/api/v1/account` — the signed-in customer's own profile and address book.
 * Bearer token only (no cookie auth), so no CSRF is strictly needed; the header is still required
 * on writes so a token leaked into a cross-site form cannot be replayed from a browser.
 *  GET    /                    profile + addresses
 *  PATCH  /profile             name / phone / language
 *  GET    /addresses           address book
 *  POST   /addresses           add (max ACCOUNT.MAX_ADDRESSES)
 *  PATCH  /addresses/:addressId
 *  DELETE /addresses/:addressId
 */
const defaults = createAccountSchemas();

/** @param {{ getSchemas?: () => ReturnType<typeof createAccountSchemas> }} [opts] settings-aware schemas */
export function createAccountRouter({ getSchemas = () => defaults } = {}) {
  const r = express.Router();
  const write = [
    requireCsrfProtection(),
    createRateLimiter({ name: 'account-write', ...LIMITS.accountWrite, failClosed: true }),
  ];
  // One validate() per route: it REPLACES req.valid, so params and body are parsed together.
  const check = (name) =>
    validate({ params: defaults.addressParam, ...(name && { body: () => getSchemas()[name] }) });
  const body = (name) => validate({ body: () => getSchemas()[name] });

  r.use(requireAuth(PRINCIPAL_TYPES.CUSTOMER), (_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });

  r.get('/', c.getAccount);
  r.patch('/profile', ...write, body('updateProfile'), c.updateProfile);
  r.get('/addresses', c.listAddresses);
  r.post('/addresses', ...write, body('addressBody'), c.addAddress);
  r.patch('/addresses/:addressId', ...write, check('addressUpdate'), c.updateAddress);
  r.delete('/addresses/:addressId', ...write, check(), c.removeAddress);
  return r;
}
