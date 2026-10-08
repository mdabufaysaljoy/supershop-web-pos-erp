import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { objectId, plainText } from '../validators/fields.js';

/** Storefront product search contracts (P1.8). Prices are integer halalas. */
export const SEARCH = Object.freeze({
  SORTS: Object.freeze(['relevance', 'newest', 'price_asc', 'price_desc', 'name']),
  MAX_LIMIT: 48,
  MAX_BRANDS: 20,
});

const intParam = (min, max) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : Number(v)),
    z.number({ error: V.INVALID_TYPE }).int({ error: V.INVALID_TYPE }).min(min).max(max).optional(),
  );
const lang = z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional();

export function createSearchSchemas() {
  return {
    searchQuery: z
      .object({
        q: plainText({ max: 100 }).optional(),
        lang,
        categoryId: objectId.optional(),
        /** Comma-separated brand ids (flat query strings only). */
        brands: z
          .string()
          .optional()
          .transform((v) => (v ? [...new Set(v.split(',').filter(Boolean))] : undefined))
          .pipe(z.array(objectId).max(SEARCH.MAX_BRANDS, { error: V.TOO_LONG }).optional()),
        minPrice: intParam(0, Number.MAX_SAFE_INTEGER),
        maxPrice: intParam(0, Number.MAX_SAFE_INTEGER),
        sort: z.enum(SEARCH.SORTS, { error: V.INVALID_TYPE }).optional(),
        page: intParam(1, 500).default(1),
        limit: intParam(1, SEARCH.MAX_LIMIT).default(24),
      })
      .transform(({ brands, ...rest }) => ({ ...rest, ...(brands && { brandIds: brands }) })),
    suggestQuery: z.object({ q: plainText({ min: 1, max: 100 }), lang }),
  };
}
