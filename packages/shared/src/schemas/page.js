import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { V } from '../validators/messages.js';
import { objectId, paginationQuery, plainText, slug } from '../validators/fields.js';
import { pageContentSchema } from '../blocks/page.js';

/**
 * Page contracts (P5.1). The block document itself is validated by the registry
 * (`pageContentSchema`), so the builder gets one error per wrong prop with its exact path.
 */
export const PAGE = Object.freeze({ TITLE_MAX: 120, SEO_TITLE_MAX: 70, SEO_DESCRIPTION_MAX: 160 });

const seo = z
  .object({
    title: plainText({ max: PAGE.SEO_TITLE_MAX }).optional(),
    description: plainText({ max: PAGE.SEO_DESCRIPTION_MAX }).optional(),
  })
  .strict();

export function createPageSchemas() {
  return {
    idParam: z.object({ id: objectId }),
    listQuery: paginationQuery({ sortable: ['updatedAt'], defaultSort: '-updatedAt' }).extend({
      status: z.enum(['draft', 'published'], { error: V.INVALID_TYPE }).optional(),
    }),
    create: z
      .object({
        title: plainText({ min: 1, max: PAGE.TITLE_MAX }),
        slug: slug.optional(),
        draft: pageContentSchema.optional(),
        seo: seo.optional(),
      })
      .strict(),
    update: z
      .object({
        title: plainText({ min: 1, max: PAGE.TITLE_MAX }).optional(),
        slug: slug.optional(),
        draft: pageContentSchema.optional(),
        seo: seo.optional(),
        isHome: z.boolean({ error: V.INVALID_TYPE }).optional(),
      })
      .strict()
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
    publicQuery: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
    slugParam: z.object({ slug }),
  };
}
