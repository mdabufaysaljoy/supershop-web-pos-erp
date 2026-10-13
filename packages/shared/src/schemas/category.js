import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { objectId, plainText, slug } from '../validators/fields.js';

/**
 * Category tree contracts (API validation + admin forms). Text is English source; other languages
 * are generated automatically (CLAUDE.md §5.7).
 */
export const CATEGORY = Object.freeze({
  NAME_MAX: 80,
  DESCRIPTION_MAX: 2000,
  SEO_TITLE_MAX: 70,
  SEO_DESCRIPTION_MAX: 160,
  /** Safety ceiling, not a business limit ("unlimited" for any real catalog). */
  MAX_DEPTH: 20,
});

export function createCategorySchemas() {
  const seo = z
    .object({
      title: plainText({ max: CATEGORY.SEO_TITLE_MAX }).optional(),
      description: plainText({ max: CATEGORY.SEO_DESCRIPTION_MAX }).optional(),
    })
    .strict();
  const fields = {
    name: plainText({ min: 1, max: CATEGORY.NAME_MAX }),
    description: plainText({ max: CATEGORY.DESCRIPTION_MAX }).optional(),
    /** Omit on create to derive it from the name. */
    slug: slug.optional(),
    imageId: objectId.nullable().optional(),
    isActive: z.boolean({ error: V.INVALID_TYPE }).optional(),
    seo: seo.optional(),
  };

  return {
    idParam: z.object({ id: objectId }),
    create: z.object({ ...fields, parentId: objectId.nullable().optional() }),
    update: z
      .object({ ...fields, name: fields.name.optional() })
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
    /** Re-parent and/or reorder: place under `parentId` (null = top level) at `index`. */
    move: z.object({
      parentId: objectId.nullable(),
      index: z.number({ error: V.INVALID_TYPE }).int().min(0).max(100_000),
    }),
    publicQuery: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
  };
}
