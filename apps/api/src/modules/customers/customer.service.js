import { EVENTS, PRINCIPAL_TYPES, validators } from '@supershop/shared';
import { withTransaction } from '../../core/db.js';
import { ConflictError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { issueSession, requestEmailVerification, setPassword } from '../auth/index.js';
import * as repo from './customer.repo.js';

const TYPE = PRINCIPAL_TYPES.CUSTOMER;

/** Safe-to-return customer profile. */
export const toCustomerProfile = (c) => ({
  id: String(c._id),
  name: c.name,
  email: c.email,
  emailVerified: Boolean(c.emailVerifiedAt),
  phone: c.phone,
  lang: c.lang,
});

const toRef = (c) => (c ? { id: String(c._id), status: c.status, email: c.email } : null);

/**
 * Registers a customer with a password and starts a session.
 * Email/phone already in use → 409 with the conflicting field names. (Claiming a passwordless
 * guest-checkout record must go through email ownership proof — the password-reset flow — so a
 * stranger can't take over someone's order history. Revisit UX in P3.5.)
 * @param {{ name: string, email: string, phone?: string, password: string }} input validated
 * @param {import('../auth/auth.service.js').RequestContext} ctx
 */
export async function registerCustomer({ password, ...data }, ctx = {}) {
  const clash = await repo.findCustomerByEmailOrPhone(data);
  if (clash) {
    const fields = [];
    if (clash.email === data.email) fields.push('email');
    if (data.phone && clash.phone === data.phone) fields.push('phone');
    throw new ConflictError('Account already exists', { fields });
  }

  const customer = await withTransaction(async (session) => {
    const doc = await repo.createCustomer({ ...data, phone: data.phone ?? null }, { session });
    await setPassword(TYPE, doc._id, password, { session });
    return doc;
  });
  const id = String(customer._id);

  void eventBus.emit(EVENTS.CUSTOMER_REGISTERED, { customerId: id }, { requestId: ctx.requestId });
  await requestEmailVerification(TYPE, id, ctx);
  const tokens = await issueSession(TYPE, id, ctx);
  return { tokens, profile: toCustomerProfile(customer) };
}

/** @type {import('../auth/principals.js').PrincipalAdapter} */
export const customerPrincipal = {
  async findByLoginIdentifier(identifier) {
    const value = String(identifier).trim();
    if (value.includes('@')) return toRef(await repo.findCustomerByEmail(value.toLowerCase()));
    const phone = validators.normalizePhone(value, { allowInternational: true });
    return phone ? toRef(await repo.findCustomerByPhone(phone)) : null;
  },
  findByEmail: async (email) => toRef(await repo.findCustomerByEmail(email)),
  findById: async (id) => toRef(await repo.findCustomerById(id)),
  getProfile: async (id) => {
    const c = await repo.findCustomerById(id);
    return c ? toCustomerProfile(c) : null;
  },
  markEmailVerified: async (id) => {
    await repo.markEmailVerified(id);
  },
};
