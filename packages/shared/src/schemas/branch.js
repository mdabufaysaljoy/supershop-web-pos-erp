import { z } from 'zod';
import { normalizeDigits } from '../digits.js';
import { V } from '../validators/messages.js';
import { email, objectId, phone, plainText } from '../validators/fields.js';

/**
 * Branch contracts (P2.1). Address fields follow the Saudi National Address (building number,
 * street, district, city, postal code, additional number, short address) — all optional.
 * Branch names are English source (auto-translated); addresses are data and never translated.
 */
export const BRANCH = Object.freeze({
  TYPES: Object.freeze(['store', 'warehouse']),
  NAME_MAX: 80,
  MAX_BRANCHES: 500,
});

const clearable = (schema) =>
  z.union([z.literal('').transform(() => null), z.null(), schema]).optional();
/** Digits-only code of a fixed length (Arabic digits accepted). */
const digits = (n) =>
  z
    .string({ error: V.INVALID_TYPE })
    .trim()
    .transform((v) => normalizeDigits(v))
    .pipe(z.string().regex(new RegExp(`^\\d{${n}}$`), { error: V.INVALID_TYPE }));

const address = z
  .object({
    buildingNumber: clearable(digits(4)),
    street: clearable(plainText({ min: 1, max: 120 })),
    district: clearable(plainText({ min: 1, max: 80 })),
    city: clearable(plainText({ min: 1, max: 60 })),
    postalCode: clearable(digits(5)),
    additionalNumber: clearable(digits(4)),
    /** e.g. RRRD2929: 4 letters + 4 digits. */
    shortAddress: clearable(
      z
        .string()
        .trim()
        .transform((v) => normalizeDigits(v).toUpperCase().replace(/\s/g, ''))
        .pipe(z.string().regex(/^[A-Z]{4}\d{4}$/, { error: V.INVALID_TYPE })),
    ),
  })
  .strict();

export function createBranchSchemas() {
  const fields = {
    /** Short unique code used on receipts and document numbers (e.g. RUH-01). */
    code: z
      .string({ error: V.REQUIRED })
      .trim()
      .transform((v) => normalizeDigits(v).toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]{1,11}$/, { error: V.CODE_INVALID })),
    name: plainText({ min: 1, max: BRANCH.NAME_MAX }),
    type: z.enum(BRANCH.TYPES, { error: V.INVALID_TYPE }),
    address: address.optional(),
    phone: clearable(phone()),
    email: clearable(email),
    location: z
      .object({
        lat: z.number({ error: V.INVALID_TYPE }).min(-90).max(90),
        lng: z.number({ error: V.INVALID_TYPE }).min(-180).max(180),
      })
      .strict()
      .nullable()
      .optional(),
    isActive: z.boolean({ error: V.INVALID_TYPE }).optional(),
    /** Ships online orders from this branch's stock. */
    fulfillsOnlineOrders: z.boolean({ error: V.INVALID_TYPE }).optional(),
    /** Customers may choose "pick up in store" here. */
    pickupEnabled: z.boolean({ error: V.INVALID_TYPE }).optional(),
  };
  return {
    idParam: z.object({ id: objectId }),
    staffParam: z.object({ id: objectId, staffId: objectId }),
    create: z.object({ ...fields, type: fields.type.default('store') }),
    update: z
      .object({
        ...fields,
        code: fields.code.optional(),
        name: fields.name.optional(),
        type: fields.type.optional(),
      })
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
    assignStaff: z.object({ staffId: objectId }),
  };
}
