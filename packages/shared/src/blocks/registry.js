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
    // A pattern may reach into a list ('items.*.question'); the first segment is the prop itself.
    const prop = path.split('.')[0];
    if (!(prop in props))
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

// --------------------------------------------------------- the shop's own sections (P5.3)
// Everything a shop puts on a page without a developer. Blocks that need DATA (products,
// categories, brands) say what they want in their props; the API resolves it for the page and
// hands it to the renderer, so a block never queries anything itself.

const link = z.union([
  z.literal(''),
  httpUrl,
  z.string().regex(/^\/[\w\-./?=&%+#]*$/, { error: V.URL_INVALID }),
]);
const mediaId = objectId.nullable();
const shortText = (max = 80) => plainText({ max });

/** The icons a "selling point" can carry; the renderer draws these and nothing else. */
export const FEATURE_ICONS = Object.freeze(['truck', 'shield', 'refresh', 'headset', 'offers']);

defineBlock({
  type: 'heroCarousel',
  props: {
    slides: z
      .array(
        z
          .object({
            mediaId,
            heading: shortText(120),
            text: plainText({ max: 300 }),
            buttonLabel: shortText(40),
            href: link,
          })
          .strict(),
      )
      .max(10),
    autoplaySeconds: z.number().int().min(0).max(30),
  },
  translatable: ['slides.*.heading', 'slides.*.text', 'slides.*.buttonLabel'],
  defaults: {
    slides: [
      {
        mediaId: null,
        heading: 'Your headline',
        text: '',
        buttonLabel: 'Shop now',
        href: '/search',
      },
    ],
    autoplaySeconds: 0,
  },
  label: 'Hero carousel',
  icon: 'carousel',
  editors: {
    slides: {
      control: 'repeater',
      label: 'Slides',
      itemLabel: 'Slide',
      max: 10,
      itemEditors: [
        { name: 'mediaId', control: 'media', label: 'Image' },
        { name: 'heading', control: 'text', label: 'Headline' },
        { name: 'text', control: 'text', label: 'Supporting line' },
        { name: 'buttonLabel', control: 'text', label: 'Button' },
        { name: 'href', control: 'text', label: 'Goes to' },
      ],
      itemDefaults: { mediaId: null, heading: '', text: '', buttonLabel: '', href: '/search' },
    },
    autoplaySeconds: {
      control: 'number',
      label: 'Change slide every (seconds)',
      help: '0 keeps it still.',
    },
  },
});

defineBlock({
  type: 'categoryGrid',
  props: {
    heading: shortText(120),
    /** Empty = the shop's top-level categories, in their own order. */
    categoryIds: z.array(objectId).max(12),
    columns: z.enum(['2', '3', '4'], { error: V.INVALID_TYPE }),
  },
  translatable: ['heading'],
  defaults: { heading: 'Shop by category', categoryIds: [], columns: '3' },
  label: 'Category grid',
  icon: 'grid',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    categoryIds: {
      control: 'categories',
      label: 'Categories',
      help: 'Leave empty to show the main ones.',
    },
    columns: { control: 'select', label: 'Columns', options: ['2', '3', '4'] },
  },
});

defineBlock({
  type: 'productRail',
  props: {
    heading: shortText(120),
    source: z.enum(['newest', 'bestSelling', 'category', 'tag', 'manual'], {
      error: V.INVALID_TYPE,
    }),
    categoryId: objectId.nullable(),
    tag: plainText({ max: 40 }),
    productIds: z.array(objectId).max(20),
    limit: z.number().int().min(2).max(20),
  },
  translatable: ['heading'],
  defaults: {
    heading: 'Picked for you',
    source: 'newest',
    categoryId: null,
    tag: '',
    productIds: [],
    limit: 8,
  },
  label: 'Product row',
  icon: 'products',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    source: {
      control: 'select',
      label: 'Which products',
      options: ['newest', 'bestSelling', 'category', 'tag', 'manual'],
    },
    categoryId: { control: 'category', label: 'Category', help: 'Used when "category" is chosen.' },
    tag: { control: 'text', label: 'Tag', help: 'Used when "tag" is chosen.' },
    productIds: { control: 'products', label: 'Products', help: 'Used when "manual" is chosen.' },
    limit: { control: 'number', label: 'How many', min: 2, max: 20 },
  },
});

defineBlock({
  type: 'banner',
  props: {
    mediaId,
    heading: shortText(120),
    text: plainText({ max: 300 }),
    buttonLabel: shortText(40),
    href: link,
    tone: z.enum(['light', 'dark'], { error: V.INVALID_TYPE }),
  },
  translatable: ['heading', 'text', 'buttonLabel'],
  defaults: {
    mediaId: null,
    heading: 'Offer of the week',
    text: '',
    buttonLabel: 'See it',
    href: '/search',
    tone: 'dark',
  },
  label: 'Banner',
  icon: 'banner',
  editors: {
    mediaId: { control: 'media', label: 'Background image' },
    heading: { control: 'text', label: 'Heading' },
    text: { control: 'text', label: 'Supporting line' },
    buttonLabel: { control: 'text', label: 'Button' },
    href: { control: 'text', label: 'Goes to' },
    tone: { control: 'select', label: 'Text colour', options: ['light', 'dark'] },
  },
});

defineBlock({
  type: 'video',
  props: {
    /** YouTube/Vimeo page or embed URL; anything else is refused. */
    url: httpUrl,
    title: shortText(120),
  },
  translatable: ['title'],
  defaults: { url: '', title: '' },
  label: 'Video',
  icon: 'video',
  editors: {
    url: { control: 'text', label: 'Video address', help: 'A YouTube or Vimeo link.' },
    title: { control: 'text', label: 'Title for screen readers' },
  },
});

defineBlock({
  type: 'faq',
  props: {
    heading: shortText(120),
    items: z
      .array(z.object({ question: shortText(200), answer: plainText({ max: 1000 }) }).strict())
      .max(30),
  },
  translatable: ['heading', 'items.*.question', 'items.*.answer'],
  defaults: { heading: 'Questions', items: [{ question: '', answer: '' }] },
  label: 'Questions & answers',
  icon: 'faq',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    items: {
      control: 'repeater',
      label: 'Questions',
      itemLabel: 'Question',
      max: 30,
      itemEditors: [
        { name: 'question', control: 'text', label: 'Question' },
        { name: 'answer', control: 'textarea', label: 'Answer' },
      ],
      itemDefaults: { question: '', answer: '' },
    },
  },
});

defineBlock({
  type: 'features',
  props: {
    heading: shortText(120),
    items: z
      .array(
        z
          .object({
            title: shortText(80),
            text: plainText({ max: 300 }),
            icon: z.enum(FEATURE_ICONS, { error: V.INVALID_TYPE }),
          })
          .strict(),
      )
      .max(12),
  },
  translatable: ['heading', 'items.*.title', 'items.*.text'],
  defaults: {
    heading: 'Why shop with us',
    items: [{ title: 'Fast delivery', text: 'Across the Kingdom.', icon: 'truck' }],
  },
  label: 'Selling points',
  icon: 'features',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    items: {
      control: 'repeater',
      label: 'Points',
      itemLabel: 'Point',
      max: 12,
      itemEditors: [
        { name: 'title', control: 'text', label: 'Title' },
        { name: 'text', control: 'text', label: 'Description' },
        { name: 'icon', control: 'select', label: 'Icon', options: FEATURE_ICONS },
      ],
      itemDefaults: { title: '', text: '', icon: 'truck' },
    },
  },
});

defineBlock({
  type: 'testimonials',
  props: {
    heading: shortText(120),
    items: z
      .array(z.object({ quote: plainText({ max: 400 }), author: shortText(60) }).strict())
      .max(12),
  },
  translatable: ['heading', 'items.*.quote'],
  defaults: { heading: 'What people say', items: [{ quote: '', author: '' }] },
  label: 'Customer quotes',
  icon: 'quote',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    items: {
      control: 'repeater',
      label: 'Quotes',
      itemLabel: 'Quote',
      max: 12,
      itemEditors: [
        { name: 'quote', control: 'textarea', label: 'What they said' },
        { name: 'author', control: 'text', label: 'Who said it' },
      ],
      itemDefaults: { quote: '', author: '' },
    },
  },
});

defineBlock({
  type: 'countdown',
  props: {
    heading: shortText(120),
    /** When the offer ends, as an ISO date-time; the renderer counts down to it. */
    endsAt: z.union([z.literal(''), z.iso.datetime({ offset: true, error: V.INVALID_TYPE })]),
    buttonLabel: shortText(40),
    href: link,
  },
  translatable: ['heading', 'buttonLabel'],
  defaults: {
    heading: 'Offer ends soon',
    endsAt: '',
    buttonLabel: 'Shop the offer',
    href: '/search',
  },
  label: 'Countdown',
  icon: 'clock',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    endsAt: { control: 'datetime', label: 'Ends at' },
    buttonLabel: { control: 'text', label: 'Button' },
    href: { control: 'text', label: 'Goes to' },
  },
});

defineBlock({
  type: 'brandStrip',
  props: {
    heading: shortText(120),
    /** Empty = every active brand that has a logo. */
    brandIds: z.array(objectId).max(20),
  },
  translatable: ['heading'],
  defaults: { heading: 'Brands we carry', brandIds: [] },
  label: 'Brand strip',
  icon: 'brands',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    brandIds: { control: 'brands', label: 'Brands', help: 'Leave empty to show them all.' },
  },
});

defineBlock({
  type: 'newsletter',
  props: {
    heading: shortText(120),
    text: plainText({ max: 300 }),
    buttonLabel: shortText(40),
  },
  translatable: ['heading', 'text', 'buttonLabel'],
  defaults: {
    heading: 'Subscribe for new offer updates',
    text: 'Get exclusive deals, flash discounts, and new arrivals delivered straight to your inbox.',
    buttonLabel: 'Subscribe',
  },
  label: 'Newsletter sign-up',
  icon: 'mail',
  editors: {
    heading: { control: 'text', label: 'Heading' },
    text: { control: 'text', label: 'Supporting line' },
    buttonLabel: { control: 'text', label: 'Button' },
  },
});

defineBlock({
  type: 'customHtml',
  props: {
    /** Sanitized server-side on save, like the rich text block (§5.1). */
    html: z.string({ error: V.INVALID_TYPE }).max(20_000, { error: V.TOO_LONG }),
  },
  defaults: { html: '' },
  label: 'Custom HTML',
  icon: 'code',
  editors: {
    html: {
      control: 'code',
      label: 'HTML',
      help: 'Scripts, styles and frames are removed when this is saved.',
    },
  },
});

defineBlock({
  type: 'columns',
  props: { gap: z.enum(['sm', 'md', 'lg'], { error: V.INVALID_TYPE }) },
  defaults: { gap: 'md' },
  container: true,
  label: 'Columns',
  icon: 'columns',
  editors: { gap: { control: 'select', label: 'Space between', options: ['sm', 'md', 'lg'] } },
});
