import { z } from 'zod';
import { V } from '../validators/messages.js';
import { objectId, plainText } from '../validators/fields.js';
import { PRODUCT } from './product.js';

/** Product import/export (P1.7) request contracts. */
export const PRODUCT_TRANSFER = Object.freeze({
  FORMATS: Object.freeze(['csv', 'xlsx']),
  /** upsert: create new products and update existing ones (by product_key); create: new only. */
  MODES: Object.freeze(['upsert', 'create']),
  TYPES: Object.freeze(['import', 'export']),
});

const format = z.enum(PRODUCT_TRANSFER.FORMATS, { error: V.INVALID_TYPE });
/** Multipart text fields arrive as strings. */
const boolField = z.preprocess(
  (v) =>
    v === 'true' || v === true ? true : v === 'false' || v === false || v === undefined ? false : v,
  z.boolean({ error: V.INVALID_TYPE }),
);

export function createProductTransferSchemas() {
  return {
    idParam: z.object({ id: objectId }),
    templateQuery: z.object({ format: format.default('xlsx') }),
    importFields: z.object({
      mode: z.enum(PRODUCT_TRANSFER.MODES, { error: V.INVALID_TYPE }).default('upsert'),
      dryRun: boolField,
    }),
    exportBody: z.object({
      format: format.default('xlsx'),
      filters: z
        .object({
          status: z.enum(PRODUCT.STATUSES, { error: V.INVALID_TYPE }).optional(),
          categoryId: objectId.optional(),
          brandId: objectId.optional(),
          supplierId: objectId.optional(),
          q: plainText({ max: 100 }).optional(),
        })
        .strict()
        .default({}),
    }),
    jobsQuery: z.object({
      type: z.enum(PRODUCT_TRANSFER.TYPES, { error: V.INVALID_TYPE }).optional(),
    }),
  };
}
