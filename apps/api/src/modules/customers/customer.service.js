import { deriveCustomerSegment, EVENTS, PRINCIPAL_TYPES, validators } from '@supershop/shared';
import { withTransaction } from '../../core/db.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { issueSession, requestEmailVerification, setPassword } from '../auth/index.js';
import { getCustomerLoyaltySummary, listCustomerLedger } from '../loyalty/index.js';
import { getCustomerOrdersSummary } from '../orders/index.js';
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

/**
 * Sign-in through an identity provider (P3.5). Called ONLY after the provider verified the email:
 *  1. known identity (provider + stable `sub`) → that account;
 *  2. an existing account with that email → link the identity to it (the provider vouched for the
 *     address, which is the same proof the verification link gives);
 *  3. otherwise a new, already-verified customer.
 * Passwordless guest records (checkout) are claimed the same way — by proven email, never by name.
 * @param {{ provider: string, sub: string, email: string, name?: string | null }} identity
 */
export async function findOrCreateCustomerFromOAuth({ provider, sub, email, name }, ctx = {}) {
  const linked = await repo.findCustomerByIdentity(provider, sub);
  const existing = linked ?? (await repo.findCustomerByEmail(email));
  if (existing?.status === 'disabled') throw new ForbiddenError('This account is disabled');

  if (existing) {
    const id = String(existing._id);
    if (!linked) {
      await repo.addIdentity(id, provider, sub);
      void eventBus.emit(EVENTS.CUSTOMER_OAUTH_LINKED, { customerId: id, provider }, ctx);
    }
    if (!existing.emailVerifiedAt) {
      await repo.markEmailVerified(id);
      emitEmailVerified(id, ctx);
    }
    return { principalId: id, profile: toCustomerProfile(existing), created: false };
  }

  const created = await repo.createCustomer({
    name: name?.trim() || email.split('@')[0],
    email,
    emailVerifiedAt: new Date(),
    identities: [{ provider, sub, linkedAt: new Date() }],
  });
  const id = String(created._id);
  void eventBus.emit(EVENTS.CUSTOMER_REGISTERED, { customerId: id, provider }, ctx);
  void eventBus.emit(EVENTS.CUSTOMER_OAUTH_LINKED, { customerId: id, provider }, ctx);
  emitEmailVerified(id, ctx);
  return { principalId: id, profile: toCustomerProfile(created), created: true };
}

/**
 * The same event the verification link emits: other modules (order history, P3.5) treat it as
 * "this email is proven" and need not know how it was proven.
 */
const emitEmailVerified = (customerId, ctx) =>
  void eventBus.emit(
    EVENTS.AUTH_EMAIL_VERIFIED,
    { principalType: TYPE, principalId: customerId },
    { requestId: ctx.requestId },
  );

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
  findOrCreateFromOAuth: findOrCreateCustomerFromOAuth,
};

/**
 * The customer behind a phone number or an email, for attaching a sale at the counter (P6.1).
 * It LOOKS UP; it never creates an account from the till — that is the customer's own decision.
 * @returns {Promise<null | { id: string, name: string, phone: string, email: string | null }>}
 */
export async function findCustomerByContact({ phone, email, id, customerId } = {}) {
  const targetId = customerId || id;
  const found =
    (targetId ? await repo.findCustomerById(targetId) : null) ??
    (phone ? await repo.findCustomerByPhone(phone) : null) ??
    (email ? await repo.findCustomerByEmail(email) : null);
  return found
    ? { id: String(found._id), name: found.name, phone: found.phone, email: found.email ?? null }
    : null;
}

// ------------------------------------------------------------------ P7.2 admin service

export async function listCustomersForAdmin(query) {
  return repo.listCustomersWithMetrics(query);
}

export async function getCustomerSegmentsSummary(query) {
  return repo.getSegmentsSummary(query);
}

export async function getCustomerDetailForAdmin(customerId) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new NotFoundError('Customer not found');

  const ordersSummary = await getCustomerOrdersSummary(customerId);

  let loyaltySummary = {
    pointsBalance: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
    tier: 'bronze',
    status: 'active',
  };
  let recentLedger = [];

  try {
    const acc = await getCustomerLoyaltySummary(customerId);
    if (acc) loyaltySummary = acc;
    const ledger = await listCustomerLedger(customerId, { limit: 10 });
    recentLedger = ledger?.items ?? [];
  } catch {
    // Loyalty account may not exist yet
  }

  const segment = deriveCustomerSegment({
    orderCount: ordersSummary.orderCount,
    lifetimeSpendHalalas: ordersSummary.lifetimeSpend,
    lastOrderAt: ordersSummary.lastOrderAt,
    createdAt: customer.createdAt,
    tier: loyaltySummary.tier,
  });

  const averageOrderValue =
    ordersSummary.orderCount > 0
      ? Math.round(ordersSummary.lifetimeSpend / ordersSummary.orderCount)
      : 0;

  return {
    id: String(customer._id),
    name: customer.name,
    email: customer.email,
    emailVerified: Boolean(customer.emailVerifiedAt),
    phone: customer.phone,
    status: customer.status,
    lang: customer.lang,
    addresses: customer.addresses ?? [],
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    stats: {
      orderCount: ordersSummary.orderCount,
      lifetimeSpend: ordersSummary.lifetimeSpend,
      averageOrderValue,
      lastOrderAt: ordersSummary.lastOrderAt,
      segment,
    },
    loyalty: {
      account: loyaltySummary,
      recentLedger,
    },
    recentOrders: ordersSummary.recentOrders,
  };
}

export async function updateCustomerByAdmin(actor, customerId, patch) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new NotFoundError('Customer not found');

  if (patch.phone && patch.phone !== customer.phone) {
    const clash = await repo.findOtherCustomerByPhone(customerId, patch.phone);
    if (clash) throw new ConflictError('Phone number already in use by another customer');
  }

  const updated = await repo.updateCustomer(customerId, patch);

  void eventBus.emit(EVENTS.CUSTOMER_UPDATED, {
    customerId: String(customer._id),
    actorId: actor?.staffId ? String(actor.staffId) : null,
    before: toCustomerProfile(customer),
    after: toCustomerProfile(updated),
  });

  return getCustomerDetailForAdmin(customerId);
}

export const countNewCustomers = (start, end) => repo.countNewCustomers(start, end);
