import { Customer } from './customer.model.js';

const notDeleted = { deletedAt: null };

export const findCustomerByEmail = (email) => Customer.findOne({ email, ...notDeleted }).lean();
export const findCustomerByPhone = (phone) => Customer.findOne({ phone, ...notDeleted }).lean();
export const findCustomerById = (id) => Customer.findOne({ _id: id, ...notDeleted }).lean();

/** Any customer (incl. soft-deleted) holding this email or phone — for uniqueness checks. */
export const findCustomerByEmailOrPhone = ({ email, phone }) =>
  Customer.findOne(
    { $or: [{ email }, ...(phone ? [{ phone }] : [])] },
    { email: 1, phone: 1 },
  ).lean();

export const createCustomer = (data, { session } = {}) =>
  Customer.create([data], { session }).then(([doc]) => doc.toObject());

export const markEmailVerified = (id) =>
  Customer.updateOne({ _id: id, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } });

// ------------------------------------------------------------------ P3.5 account

/** Another live customer already using this phone (uniqueness check before an update). */
export const findOtherCustomerByPhone = (id, phone) =>
  Customer.findOne({ _id: { $ne: id }, phone }, { _id: 1 }).lean();

export const updateCustomer = (id, patch) =>
  Customer.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: patch },
    {
      returnDocument: 'after',
    },
  ).lean();

/**
 * Address writes replace the whole array: the service computes it from the current document, so
 * "exactly one default" is decided in one place. `updatedAt` guards against a lost update.
 * @returns {Promise<object | null>} the saved customer, or null when it changed meanwhile
 */
export const replaceAddresses = (id, expectedUpdatedAt, addresses) =>
  Customer.findOneAndUpdate(
    { _id: id, updatedAt: expectedUpdatedAt, ...notDeleted },
    { $set: { addresses } },
    { returnDocument: 'after' },
  ).lean();

/** Identity lookup for OAuth sign-in (`provider` + the provider's stable user id). */
export const findCustomerByIdentity = (provider, sub) =>
  Customer.findOne({ identities: { $elemMatch: { provider, sub } }, ...notDeleted }).lean();

export const addIdentity = (id, provider, sub, { session } = {}) =>
  Customer.updateOne(
    { _id: id, identities: { $not: { $elemMatch: { provider } } } },
    { $push: { identities: { provider, sub, linkedAt: new Date() } } },
    { session },
  );
