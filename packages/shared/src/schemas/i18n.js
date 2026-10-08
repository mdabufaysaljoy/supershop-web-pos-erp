import { z } from 'zod';
import { LANGUAGES, SOURCE_LANGUAGE } from '../constants.js';
import { V } from '../validators/messages.js';
import { objectId, plainText } from '../validators/fields.js';
import { sameInterpolations } from '../i18n/localized.js';

/**
 * Admin Languages screen bodies (API validation + admin forms).
 * Arabic text here is typed by the store's Arabic-speaking staff — it is data, not source code.
 */
const targetLang = z.enum(
  /** @type {[string, ...string[]]} */ (
    Object.values(LANGUAGES).filter((l) => l !== SOURCE_LANGUAGE)
  ),
  { error: V.INVALID_TYPE },
);
const UI_KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

export function createI18nSchemas() {
  const term = plainText({ min: 1, max: 100 });
  const target = plainText({ min: 1, max: 200 });

  const glossaryBase = z.object({
    term,
    doNotTranslate: z.boolean({ error: V.INVALID_TYPE }),
    targets: z.record(targetLang, target).default({}),
  });
  // A preferred-pair term needs at least one target translation; a do-not-translate term needs none.
  const glossaryRule = (g, ctx) => {
    if (g.doNotTranslate === false && Object.keys(g.targets ?? {}).length === 0) {
      ctx.addIssue({ code: 'custom', path: ['targets'], message: V.REQUIRED });
    }
  };

  return {
    glossaryCreate: glossaryBase.superRefine(glossaryRule),
    glossaryUpdate: glossaryBase.partial().superRefine((g, ctx) => {
      if (g.doNotTranslate === false && g.targets !== undefined) glossaryRule(g, ctx);
    }),
    glossaryIdParam: z.object({ id: objectId }),

    uiOverrideParams: z.object({
      catalog: z.enum(['storefront', 'admin'], { error: V.INVALID_TYPE }),
      lang: targetLang,
      key: z.string().regex(UI_KEY_RE, { error: V.CODE_INVALID }).max(150),
    }),
    uiOverrideListParams: z.object({
      catalog: z.enum(['storefront', 'admin'], { error: V.INVALID_TYPE }),
      lang: targetLang,
    }),
    /** `source` = the English text the override translates (placeholder parity + staleness hash). */
    uiOverrideBody: z
      .object({ value: plainText({ min: 1, max: 500 }), source: z.string().min(1).max(2000) })
      .refine((b) => sameInterpolations(b.source, b.value), {
        path: ['value'],
        error: V.PLACEHOLDERS_CHANGED,
      }),

    retranslateBody: z.object({
      /** pending_failed: only items not yet translated / failed; all: force every auto translation. */
      scope: z.enum(['pending_failed', 'all'], { error: V.INVALID_TYPE }),
    }),
    jobIdParam: z.object({ id: z.string().regex(/^[\w:-]{1,100}$/, { error: V.ID_INVALID }) }),
  };
}
