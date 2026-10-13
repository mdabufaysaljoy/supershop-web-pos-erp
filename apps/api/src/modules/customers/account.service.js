import { ACCOUNT, EVENTS } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import * as repo from './customer.repo.js';
import { toCustomerProfile } from './customer.service.js';

/**
 * Customer self-service (P3.5): the signed-in customer reads and edits THEIR OWN record. Every
 * function takes the id from the session — nothing here accepts a customer id from the client.
 */

const ATTEMPTS = 3;

export const toAddressDto = (a) => ({
  id: String(a._id),
  label: a.label ?? null,
  address: a.address,
  isDefault: Boolean(a.isDefault),
});

const loadCustomer = async (customerId) => {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new NotFoundError('Account not found');
  return customer;
};

const emitUpdated = (customerId, change, ctx) =>
  void eventBus.emit(
    EVENTS.CUSTOMER_UPDATED,
    { customerId: String(customerId), change },
    { requestId: ctx.requestId },
  );

/** Profile + address book in one call (what the account pages render). */
export async function getAccount(customerId) {
  const customer = await loadCustomer(customerId);
  return {
    ...toCustomerProfile(customer),
    addresses: (customer.addresses ?? []).map(toAddressDto),
  };
}

/**
 * Name, phone and preferred language. The email is NOT changeable here: it identifies the account
 * and changing it needs proof of the new address (verification flow) — P4.5 adds that.
 * @param {{ name?: string, phone?: string, lang?: string }} patch validated
 */
export async function updateProfile(customerId, patch, ctx = {}) {
  if (patch.phone) {
    const clash = await repo.findOtherCustomerByPhone(customerId, patch.phone);
    if (clash) throw new ConflictError('Phone number already in use', { fields: ['phone'] });
  }
  const updated = await repo.updateCustomer(customerId, patch);
  if (!updated) throw new NotFoundError('Account not found');
  emitUpdated(customerId, 'profile', ctx);
  return toCustomerProfile(updated);
}

/**
 * Applies `mutate(addresses)` to the address book and saves it, re-reading on a concurrent write
 * (two tabs). The whole array is written at once so "exactly one default" holds at all times.
 * @param {(addresses: object[], customer: object) => object[]} mutate
 */
async function writeAddresses(customerId, mutate) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const customer = await loadCustomer(customerId);
    const next = mutate([...(customer.addresses ?? [])], customer);
    const saved = await repo.replaceAddresses(customerId, customer.updatedAt, next);
    if (saved) return saved;
  }
  throw new ConflictError('Address book changed, please try again');
}

/** Exactly one default: an explicit choice wins, otherwise the first address stays the default. */
const withSingleDefault = (addresses, preferredIndex) => {
  const index = preferredIndex ?? addresses.findIndex((a) => a.isDefault);
  const chosen = index >= 0 ? index : 0;
  return addresses.map((a, i) => ({ ...a, isDefault: i === chosen }));
};

export async function addAddress(
  customerId,
  { label = null, address, isDefault = false },
  ctx = {},
) {
  const saved = await writeAddresses(customerId, (addresses) => {
    if (addresses.length >= ACCOUNT.MAX_ADDRESSES)
      throw new ValidationError(
        [{ path: 'address', message: V.TOO_MANY, code: 'too_big' }],
        'Address book is full',
      );
    const next = [...addresses, { label, address, isDefault }];
    return withSingleDefault(next, isDefault || addresses.length === 0 ? next.length - 1 : null);
  });
  emitUpdated(customerId, 'addressAdded', ctx);
  return saved.addresses.map(toAddressDto);
}

export async function updateAddress(customerId, addressId, patch, ctx = {}) {
  const saved = await writeAddresses(customerId, (addresses) => {
    const index = addresses.findIndex((a) => String(a._id) === String(addressId));
    if (index < 0) throw new NotFoundError('Address not found');
    const next = addresses.map((a, i) =>
      i === index
        ? {
            ...a,
            ...(patch.label !== undefined && { label: patch.label ?? null }),
            ...(patch.address !== undefined && { address: patch.address }),
          }
        : a,
    );
    return withSingleDefault(next, patch.isDefault ? index : null);
  });
  emitUpdated(customerId, 'addressUpdated', ctx);
  return saved.addresses.map(toAddressDto);
}

export async function removeAddress(customerId, addressId, ctx = {}) {
  const saved = await writeAddresses(customerId, (addresses) => {
    const next = addresses.filter((a) => String(a._id) !== String(addressId));
    if (next.length === addresses.length) throw new NotFoundError('Address not found');
    // Deleting the default promotes the first remaining address, so checkout always has one.
    return next.length ? withSingleDefault(next, null) : next;
  });
  emitUpdated(customerId, 'addressRemoved', ctx);
  return saved.addresses.map(toAddressDto);
}
