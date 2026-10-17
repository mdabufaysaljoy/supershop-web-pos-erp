import { z } from 'zod';
import { CUSTOMER_SEGMENTS } from '../customers/segments.js';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { name, objectId, paginationQuery, phone, plainText } from '../validators/fields.js';

export const createCustomerAdminSchemas = ({ allowInternationalPhone = false } = {}) => ({
  listQuery: paginationQuery({
    sortable: ['name', 'createdAt', 'orderCount', 'lifetimeSpend', 'lastOrderAt'],
    defaultSort: '-createdAt',
  }).extend({
    q: plainText({ max: 100 }).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    segment: z.enum(Object.values(CUSTOMER_SEGMENTS)).optional(),
  }),
  idParam: z.object({
    id: objectId,
  }),
  updateCustomer: z
    .object({
      name: name.optional(),
      phone: phone({ allowInternational: allowInternationalPhone }).optional().nullable(),
      status: z.enum(['active', 'disabled']).optional(),
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
});
