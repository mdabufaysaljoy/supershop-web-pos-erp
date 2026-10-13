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
