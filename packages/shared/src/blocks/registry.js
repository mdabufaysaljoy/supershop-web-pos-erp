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
 *     editors: { html: { control: 'richText', label: 'Text' } },  // what the props panel draws
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
  editors = {},
  label,
  icon,
}) {
  if (registry.has(type)) throw new Error(`Block "${type}" is already defined`);
  for (const path of translatable) {
    if (!(path in props))
      throw new Error(`Block "${type}": translatable prop "${path}" has no schema`);
  }
  const definition = Object.freeze({
    type,
    /** What the builder's palette calls it (English; the admin UI is English in v1, D-007). */
    label: label ?? type,
    icon: icon ?? 'square',
    version,
    schema: z.object(props).strict(),
    propNames: Object.freeze(Object.keys(props)),
    translatable: Object.freeze([...translatable]),
    defaults: Object.freeze({ ...defaults }),
    /**
     * How the props panel draws each prop: `{ control, label, help, options }`. Declared beside
     * the schema so a new block type needs no panel code (P5.2).
     */
    editors: Object.freeze(
      Object.fromEntries(
        Object.keys(props).map((name) => [
          name,
          Object.freeze({ control: 'text', label: name, ...editors[name] }),
        ]),
      ),
    ),
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
  listBlocks().map((b) => ({
    type: b.type,
    label: b.label,
    icon: b.icon,
    version: b.version,
    defaults: b.defaults,
  }));

/** The props panel's instructions for one block type: `[{ name, control, label, options }]`. */
export const blockEditors = (type) => {
  const definition = getBlock(type);
  return definition
    ? definition.propNames.map((name) => ({ name, ...definition.editors[name] }))
    : [];
};

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
  label: 'Heading',
  icon: 'heading',
  editors: {
    text: { control: 'text', label: 'Text' },
    level: { control: 'select', label: 'Size', options: ['h1', 'h2', 'h3'] },
    align: { control: 'select', label: 'Alignment', options: ['start', 'center'] },
  },
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
  defaults: { html: '<p></p>' },
  label: 'Text',
  icon: 'text',
  editors: {
    html: {
      control: 'richText',
      label: 'Text',
      help: 'Basic formatting is kept; scripts are removed.',
    },
  },
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
  label: 'Image',
  icon: 'image',
  editors: {
    mediaId: { control: 'media', label: 'Image' },
    alt: { control: 'text', label: 'Description for screen readers' },
    href: { control: 'text', label: 'Links to' },
    width: { control: 'select', label: 'Width', options: ['contained', 'full'] },
  },
});

defineBlock({
  type: 'spacer',
  props: { size: z.enum(['sm', 'md', 'lg'], { error: V.INVALID_TYPE }) },
  defaults: { size: 'md' },
  label: 'Space',
  icon: 'space',
  editors: { size: { control: 'select', label: 'Height', options: ['sm', 'md', 'lg'] } },
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
  label: 'Button',
  icon: 'button',
  editors: {
    label: { control: 'text', label: 'Button text' },
    href: {
      control: 'text',
      label: 'Goes to',
      help: 'A path on your site (/search) or a full https:// address.',
    },
    variant: { control: 'select', label: 'Style', options: ['primary', 'outline'] },
  },
});
