import { PRINCIPAL_TYPES } from '@supershop/shared';
import { requestContext, sendSession } from '../auth/index.js';
import { registerCustomer } from './customer.service.js';

export async function register(req, res) {
  const { tokens, profile } = await registerCustomer(req.valid.body, requestContext(req));
  sendSession(res, PRINCIPAL_TYPES.CUSTOMER, tokens, { profile }, 201);
}
