import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { name, objectId, paginationQuery, phone, plainText } from '../validators/fields.js';
import { shippingAddressSchema } from './order.js';

/**
 * Customer self-service (P3.5): profile, address book, order history. Everything here is the
 * customer's OWN data — values are never translated (§5.7) and the email is changed through the
 * verification flow, not this schema.
 */
export const ACCOUNT = Object.freeze({
  MAX_ADDRESSES: 10,
  LABEL_MAX: 40,
});

/** @param {{ allowInternationalPhone?: boolean }} [opts] from settings */
export function createAccountSchemas({ allowInternationalPhone = false } = {}) {
  const addressBody = z
    .object({
      /** "Home", "Work" — the customer's own words. */
      label: plainText({ max: ACCOUNT.LABEL_MAX }).optional(),
      address: shippingAddressSchema,
      isDefault: z.boolean().optional(),
    })
    .strict();

  return {
    /** PATCH /account/profile — only the fields the customer may change themselves. */
    updateProfile: z
      .object({
        name: name.optional(),
        phone: phone({ allowInternational: allowInternationalPhone }).optional(),
        lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
      })
      .strict()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
    addressBody,
    addressUpdate: addressBody.partial().refine((v) => Object.keys(v).length > 0, {
      error: V.REQUIRED,
    }),
    addressParam: z.object({ addressId: objectId }),
    orderParam: z.object({ id: objectId }),
    ordersQuery: paginationQuery({ sortable: ['createdAt'], defaultLimit: 10, maxLimit: 50 }),
  };
}
