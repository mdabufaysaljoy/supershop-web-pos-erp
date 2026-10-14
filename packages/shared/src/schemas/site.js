import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { MENU } from '../site/menu.js';
import { THEME, isHexColor } from '../site/theme.js';
import { V } from '../validators/messages.js';
import { httpUrl, objectId, plainText, slug } from '../validators/fields.js';

/**
 * Menus, the announcement bar and theme tokens (P5.4) — the site's chrome, all data.
 * The admin sends English only; Arabic is generated (§5.7).
 */
export const SITE = Object.freeze({
  LABEL_MAX: 60,
  ANNOUNCEMENT_MAX: 160,
  FOOTER_NOTE_MAX: 300,
  TONES: Object.freeze(['primary', 'dark', 'light']),
});

const hexColor = z
  .string({ error: V.INVALID_TYPE })
  .refine(isHexColor, { error: V.INVALID_TYPE })
  .transform((v) => v.toLowerCase());

/** A same-site path or an http(s) address — never `javascript:` and friends. */
const link = z.union([httpUrl, z.string().regex(/^\/[\w\-./?=&%+#]*$/, { error: V.URL_INVALID })]);

/** Item ids are given by the admin app (like block ids) so a label's translation can be keyed. */
const itemId = z
  .string({ error: V.INVALID_TYPE })
  .regex(/^[\w-]{1,40}$/, { error: V.INVALID_TYPE });

const itemBase = {
  id: itemId,
  label: plainText({ min: 1, max: SITE.LABEL_MAX }),
  target: z.enum(MENU.TARGETS, { error: V.INVALID_TYPE }),
  /** What it points at: a page, category or brand id. Null for `products` and `url`. */
  ref: objectId.nullable().default(null),
  href: z.union([z.literal(''), link]).default(''),
};

const child = z.object(itemBase).strict();
const item = z
  .object({ ...itemBase, children: z.array(child).max(MENU.MAX_CHILDREN).default([]) })
  .strict();

/** A `url` item needs its address; the others need the thing they point at. */
const targetIsReachable = (value, ctx) => {
  for (const [i, entry] of [...value.entries()]) {
    const check = (it, path) => {
      if (it.target === 'url' && !it.href)
        ctx.addIssue({ code: 'custom', path: [...path, 'href'], message: V.REQUIRED });
      if (['page', 'category', 'brand'].includes(it.target) && !it.ref)
        ctx.addIssue({ code: 'custom', path: [...path, 'ref'], message: V.REQUIRED });
    };
    check(entry, [i]);
    for (const [j, kid] of [...(entry.children ?? []).entries()]) check(kid, [i, 'children', j]);
  }
};

const items = z.array(item).max(MENU.MAX_ITEMS).superRefine(targetIsReachable);

const announcement = z
  .object({
    enabled: z.boolean({ error: V.INVALID_TYPE }),
    text: plainText({ max: SITE.ANNOUNCEMENT_MAX }),
    href: z.union([z.literal(''), link]),
    tone: z.enum(SITE.TONES, { error: V.INVALID_TYPE }),
  })
  .strict()
  .partial();

const theme = z
  .object({
    primary: hexColor,
    primaryForeground: hexColor,
    radius: z.enum(THEME.RADII, { error: V.INVALID_TYPE }),
    font: z.enum(THEME.FONTS, { error: V.INVALID_TYPE }),
  })
  .strict()
  .partial();

const footer = z
  .object({ note: plainText({ max: SITE.FOOTER_NOTE_MAX }), menuIds: z.array(objectId).max(4) })
  .strict()
  .partial();

export function createSiteSchemas() {
  return {
    idParam: z.object({ id: objectId }),
    publicQuery: z.object({
      lang: z.enum(Object.values(LANGUAGES), { error: V.INVALID_TYPE }).optional(),
    }),
    menuCreate: z
      .object({
        title: plainText({ min: 1, max: SITE.LABEL_MAX }),
        location: z.enum(MENU.LOCATIONS, { error: V.INVALID_TYPE }),
        slug: slug.optional(),
        items: items.optional(),
      })
      .strict(),
    menuUpdate: z
      .object({
        title: plainText({ min: 1, max: SITE.LABEL_MAX }).optional(),
        location: z.enum(MENU.LOCATIONS, { error: V.INVALID_TYPE }).optional(),
        items: items.optional(),
      })
      .strict()
      .refine((v) => Object.values(v).some((x) => x !== undefined), { error: V.REQUIRED }),
    layoutUpdate: z
      .object({
        /** Which menu is the header's main navigation (null = the shop's categories). */
        headerMenuId: objectId.nullable(),
        showCategoryRow: z.boolean({ error: V.INVALID_TYPE }),
        announcement,
        footer,
        theme,
      })
      .strict()
      .partial()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
  };
}
