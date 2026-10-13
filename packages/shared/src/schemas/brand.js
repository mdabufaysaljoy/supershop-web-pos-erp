import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { httpUrl, objectId, paginationQuery, plainText, slug } from '../validators/fields.js';

/**
 * Brand contracts. The brand NAME is a proper noun and is never translated (CLAUDE.md §5.7); its
 * description and SEO text are English source, auto-translated.
 */
export const BRAND = Object.freeze({
  NAME_MAX: 80,
  DESCRIPTION_MAX: 2000,
  SEO_TITLE_MAX: 70,
  SEO_DESCRIPTION_MAX: 160,
});

/** `''` clears an optional field (stored as null). */
const clearable = (schema) =>
  z.union([z.literal('').transform(() => null), z.null(), schema]).optional();

export function createBrandSchemas() {
  const fields = {
    name: plainText({ min: 1, max: BRAND.NAME_MAX }),
    /** Omit on create to derive it from the name. */
    slug: slug.optional(),
    description: plainText({ max: BRAND.DESCRIPTION_MAX }).optional(),
    logoId: objectId.nullable().optional(),
    website: clearable(httpUrl),
    isActive: z.boolean({ error: V.INVALID_TYPE }).optional(),
    /** Add the name to the translation glossary as "never translate" (off for common words). */
    protectName: z.boolean({ error: V.INVALID_TYPE }).optional(),
    seo: z
      .object({
        title: plainText({ max: BRAND.SEO_TITLE_MAX }).optional(),
        description: plainText({ max: BRAND.SEO_DESCRIPTION_MAX }).optional(),
      })
      .strict()
      .optional(),
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
    publicQuery: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
  };
}
