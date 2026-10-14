import { z } from 'zod';
import { V } from '../validators/messages.js';
import { httpUrl, objectId, plainText } from '../validators/fields.js';

/**
 * Block registry (P5.1) — the page builder's vocabulary. A block type is declared ONCE here with
 * its props, which of them hold text a customer reads, and its defaults; the storefront renderer,
 * the admin's props panel and the translation pipeline all read this same declaration, so adding a
 * section type is a definition plus a renderer — no router, schema or migration work (§2.4).
 *
 *   defineBlock({
 *     type: 'richText',
 *     props: { html: plainText({ max: 5000 }) },   // zod shape
 *     translatable: ['html'],                      // auto-translated (§5.7)
 *     defaults: { html: '' },
 *   })
 *
 * `version` lets a block change its props later without touching pages already saved: a page keeps
 * the version it was built with until a migration bumps it.
 */
const registry = new Map();

/**
 * @param {{
 *   type: string,
 *   version?: number,
 *   props: Record<string, import('zod').ZodType>,
 *   translatable?: string[],
 *   defaults?: Record<string, unknown>,
 *   container?: boolean,
 * }} definition
 */
export function defineBlock({
  type,
  version = 1,
  props,
  translatable = [],
  defaults = {},
  container = false,
}) {
  if (registry.has(type)) throw new Error(`Block "${type}" is already defined`);
  for (const path of translatable) {
    if (!(path in props))
      throw new Error(`Block "${type}": translatable prop "${path}" has no schema`);
  }
  const definition = Object.freeze({
    type,
    version,
    schema: z.object(props).strict(),
    propNames: Object.freeze(Object.keys(props)),
    translatable: Object.freeze([...translatable]),
    defaults: Object.freeze({ ...defaults }),
    /** A container block renders whatever blocks are nested inside it (columns, sections). */
    container,
  });
  registry.set(type, definition);
  return definition;
}

export const getBlock = (type) => registry.get(type) ?? null;
export const blockTypes = () => [...registry.keys()].sort();
export const listBlocks = () => [...registry.values()];
/** Tests and the admin's block palette both ask "what can I put on a page?". */
export const blockPalette = () =>
  listBlocks().map((b) => ({ type: b.type, version: b.version, defaults: b.defaults }));

// --------------------------------------------------------------------- core blocks
// Only the few P5.1 needs to prove the pipeline end to end; P5.3 brings the real set
// (hero carousel, product rails, category grid, banners, FAQ…).

defineBlock({
  type: 'heading',
  props: {
    text: plainText({ min: 1, max: 200 }),
    level: z.enum(['h1', 'h2', 'h3'], { error: V.INVALID_TYPE }),
    align: z.enum(['start', 'center'], { error: V.INVALID_TYPE }),
  },
  translatable: ['text'],
  defaults: { text: 'Heading', level: 'h2', align: 'start' },
});

defineBlock({
  type: 'richText',
  props: {
    /**
     * Markup is the point of this block, so it is NOT `plainText`: the server sanitizes it with
     * DOMPurify before storing (§5.1), and nothing but the builder can write it.
     */
    html: z.string({ error: V.INVALID_TYPE }).max(20_000, { error: V.TOO_LONG }),
  },
  translatable: ['html'],
  defaults: { html: '' },
});

defineBlock({
  type: 'image',
  props: {
    mediaId: objectId.nullable(),
    /** Read by screen readers and search engines: translated like any other customer-facing text. */
    alt: plainText({ max: 200 }),
    href: z.union([z.literal(''), httpUrl, z.string().regex(/^\/[\w\-./?=&%+#]*$/)]).optional(),
    width: z.enum(['full', 'contained'], { error: V.INVALID_TYPE }),
  },
  translatable: ['alt'],
  defaults: { mediaId: null, alt: '', href: '', width: 'contained' },
});

defineBlock({
  type: 'spacer',
  props: { size: z.enum(['sm', 'md', 'lg'], { error: V.INVALID_TYPE }) },
  defaults: { size: 'md' },
});

defineBlock({
  type: 'buttonLink',
  props: {
    label: plainText({ min: 1, max: 60 }),
    href: z.union([httpUrl, z.string().regex(/^\/[\w\-./?=&%+#]*$/, { error: V.URL_INVALID })]),
    variant: z.enum(['primary', 'outline'], { error: V.INVALID_TYPE }),
  },
  translatable: ['label'],
  defaults: { label: 'Shop now', href: '/search', variant: 'primary' },
});
