import { z } from 'zod';
import { V } from '../validators/messages.js';
import {
  address,
  email,
  name,
  objectId,
  paginationQuery,
  phone,
  plainText,
} from '../validators/fields.js';

/** Supplier contracts (internal purchasing data — never public, never translated). */
export const SUPPLIER = Object.freeze({
  NAME_MAX: 120,
  NOTES_MAX: 1000,
  MAX_PAYMENT_TERMS_DAYS: 365,
});

const clearable = (schema) =>
  z.union([z.literal('').transform(() => null), z.null(), schema]).optional();

/** Tax / commercial registration numbers: letters and digits, upper-cased, 5–20 chars. */
const registrationCode = z
  .string({ error: V.INVALID_TYPE })
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .min(5, { error: V.TOO_SHORT })
      .max(20, { error: V.TOO_LONG })
      .regex(/^[A-Z0-9]+$/, { error: V.CODE_INVALID }),
  );

export function createSupplierSchemas() {
  const fields = {
    /** Company name (may contain digits, e.g. "3M Arabia"). */
    name: plainText({ min: 2, max: SUPPLIER.NAME_MAX }),
    contactName: clearable(name),
    // Suppliers can be abroad: international numbers are always allowed here.
    phone: clearable(phone({ allowInternational: true })),
    email: clearable(email),
    address: clearable(address),
    taxNumber: clearable(registrationCode),
    registrationNumber: clearable(registrationCode),
    paymentTermsDays: z
      .number({ error: V.INVALID_TYPE })
      .int({ error: V.INVALID_TYPE })
      .min(0, { error: V.INVALID_TYPE })
      .max(SUPPLIER.MAX_PAYMENT_TERMS_DAYS, { error: V.TOO_LONG })
      .optional(),
    notes: plainText({ max: SUPPLIER.NOTES_MAX }).optional(),
    isActive: z.boolean({ error: V.INVALID_TYPE }).optional(),
  };
  return {
    idParam: z.object({ id: objectId }),
    listQuery: paginationQuery({ sortable: ['name', 'createdAt'], defaultSort: 'name' }).extend({
      q: plainText({ max: 100 }).optional(),
    }),
    create: z.object(fields),
    update: z
      .object({ ...fields, name: fields.name.optional() })
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
  };
}
