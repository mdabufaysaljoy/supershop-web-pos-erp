import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { MENU } from '../site/menu.js';
import { REDIRECT_STATUSES, normalizeRedirectPath } from '../site/redirects.js';
import { THEME, isHexColor } from '../site/theme.js';
import { V } from '../validators/messages.js';
import { address, email, httpUrl, objectId, phone, plainText, slug } from '../validators/fields.js';

/**
 * Menus, the announcement bar and theme tokens (P5.4) — the site's chrome, all data.
 * The admin sends English only; Arabic is generated (§5.7).
 */
export const SITE = Object.freeze({
  LABEL_MAX: 60,
  ANNOUNCEMENT_MAX: 160,
  FOOTER_NOTE_MAX: 300,
  TITLE_SUFFIX_MAX: 60,
  META_DESCRIPTION_MAX: 160,
  ROBOTS_MAX: 2000,
  REDIRECT_NOTE_MAX: 120,
  TONES: Object.freeze(['primary', 'dark', 'light']),
  /** Where a shop in Saudi Arabia is actually found; the storefront links each one. */
  SOCIAL: Object.freeze([
    'instagram',
    'tiktok',
    'snapchat',
    'x',
    'facebook',
    'youtube',
    'whatsapp',
    'linkedin',
  ]),
  REDIRECT_STATUSES,
  /** How the brand is presented in the storefront header: both, logo only, or name only. */
  LOGO_DISPLAY: Object.freeze(['both', 'logo', 'name']),
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

/** An internal path, for a redirect's source. Normalized so `/A/` and `/a` are one rule. */
const internalPath = z
  .string({ error: V.INVALID_TYPE })
  .trim()
  .min(2, { error: V.TOO_SHORT })
  .max(300, { error: V.TOO_LONG })
  .refine((v) => v.startsWith('/'), { error: V.URL_INVALID })
  .transform(normalizeRedirectPath);

const brand = z
  .object({
    /** Shown instead of the shop's name in the header, when it is set. */
    logoId: objectId.nullable(),
    faviconId: objectId.nullable(),
    /** The picture used when a page is shared (Open Graph / Twitter). */
    ogImageId: objectId.nullable(),
    /** Display choice: 'both' (logo + name), 'logo' (logo only), or 'name' (name only). */
    logoDisplay: z.enum(SITE.LOGO_DISPLAY, { error: V.INVALID_TYPE }).default('both'),
  })
  .strict()
  .partial();

const contact = z
  .object({
    phone: z.union([z.literal(''), phone({ allowInternational: true })]),
    whatsapp: z.union([z.literal(''), phone({ allowInternational: true })]),
    email: z.union([z.literal(''), email]),
    address: z.union([z.literal(''), address]),
    /** Saudi National Address short code (§5.6), printed on invoices when the shop has one. */
    nationalAddress: plainText({ max: 40 }),
    mapUrl: z.union([z.literal(''), httpUrl]),
  })
  .strict()
  .partial();

const social = z
  .array(
    z
      .object({
        platform: z.enum(SITE.SOCIAL, { error: V.INVALID_TYPE }),
        url: httpUrl,
      })
      .strict(),
  )
  .max(SITE.SOCIAL.length);

const seo = z
  .object({
    /** Appended to every page title: "Blue shirt · Supershop". */
    titleSuffix: plainText({ max: SITE.TITLE_SUFFIX_MAX }),
    defaultDescription: plainText({ max: SITE.META_DESCRIPTION_MAX }),
    /** Off for a site that is not ready: robots.txt disallows everything and pages go noindex. */
    indexable: z.boolean({ error: V.INVALID_TYPE }),
    robotsExtra: plainText({ max: SITE.ROBOTS_MAX }),
  })
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
    redirectCreate: z
      .object({
        from: internalPath,
        /** Where it goes now — a path on the site or a full address. Empty when it is gone (410). */
        to: z.union([z.literal(''), link]).default(''),
        status: z
          .union([z.literal(301), z.literal(302), z.literal(410)], { error: V.INVALID_TYPE })
          .default(301),
        note: plainText({ max: SITE.REDIRECT_NOTE_MAX }).default(''),
      })
      .strict()
      .refine((v) => v.status === 410 || Boolean(v.to), {
        error: V.REQUIRED,
        path: ['to'],
      }),
    layoutUpdate: z
      .object({
        /** Which menu is the header's main navigation (null = the shop's categories). */
        headerMenuId: objectId.nullable(),
        showCategoryRow: z.boolean({ error: V.INVALID_TYPE }),
        announcement,
        footer,
        theme,
        brand,
        contact,
        social,
        seo,
      })
      .strict()
      .partial()
      .refine((v) => Object.keys(v).length > 0, { error: V.REQUIRED }),
  };
}
