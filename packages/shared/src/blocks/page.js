import { z } from 'zod';
import { V } from '../validators/messages.js';
import { resolveLocalized } from '../i18n/localized.js';
import { getBlock } from './registry.js';

/**
 * Page content (P5.1): a versioned JSON document of blocks, and the rules that keep it honest.
 *
 *   { schemaVersion: 1, blocks: [{ id, type, version, props, blocks? }] }
 *
 * The customer-facing TEXT of those blocks does not live in `props` alone: it is mirrored into a
 * flat `texts` array (`[{ key: '<blockId>.<prop>', value: LocalizedString }]`) so the ordinary
 * translation machinery — staleness, manual overrides, retranslate-all, the failed-jobs view —
 * works on pages with no special cases (§5.7). `props` always keeps the English source, so a page
 * renders correctly even before a single translation exists.
 */
export const PAGE_SCHEMA_VERSION = 1;
export const PAGE_LIMITS = Object.freeze({ MAX_BLOCKS: 200, MAX_DEPTH: 3 });

const blockId = z
  .string({ error: V.REQUIRED })
  .trim()
  .regex(/^[A-Za-z0-9_-]{4,40}$/, { error: V.INVALID_TYPE });

/**
 * One block, validated against its own registered definition: unknown types and unknown props are
 * refused, and missing props fall back to the block's defaults.
 */
const blockSchema = z.lazy(() =>
  z
    .object({
      id: blockId,
      type: z.string({ error: V.REQUIRED }).trim().min(1).max(40),
      version: z.number().int().min(1).optional(),
      props: z.record(z.string(), z.unknown()).default({}),
      blocks: z.array(blockSchema).max(PAGE_LIMITS.MAX_BLOCKS).optional(),
    })
    .strict()
    .superRefine((block, ctx) => {
      const definition = getBlock(block.type);
      if (!definition) {
        ctx.addIssue({ code: 'custom', path: ['type'], message: V.INVALID_TYPE });
        return;
      }
      const parsed = definition.schema.safeParse({ ...definition.defaults, ...block.props });
      if (!parsed.success) {
        for (const issue of parsed.error.issues)
          ctx.addIssue({ code: 'custom', path: ['props', ...issue.path], message: issue.message });
        return;
      }
      block.props = parsed.data;
      block.version ??= definition.version;
      if (block.blocks && !definition.container)
        ctx.addIssue({ code: 'custom', path: ['blocks'], message: V.INVALID_TYPE });
    }),
);

export const pageContentSchema = z
  .object({
    schemaVersion: z.literal(PAGE_SCHEMA_VERSION).default(PAGE_SCHEMA_VERSION),
    blocks: z.array(blockSchema).max(PAGE_LIMITS.MAX_BLOCKS).default([]),
  })
  .strict()
  .superRefine((content, ctx) => {
    const seen = new Set();
    const walk = (blocks, depth) => {
      if (depth > PAGE_LIMITS.MAX_DEPTH)
        ctx.addIssue({ code: 'custom', path: ['blocks'], message: V.TOO_LONG });
      for (const block of blocks) {
        // Ids address a block in the builder, in a translation key and in an anchor link: they
        // must be unique across the whole page, not just among siblings.
        if (seen.has(block.id))
          ctx.addIssue({ code: 'custom', path: ['blocks'], message: V.ALREADY_EXISTS });
        seen.add(block.id);
        if (block.blocks?.length) walk(block.blocks, depth + 1);
      }
    };
    walk(content.blocks ?? [], 1);
  });

/** Every block on the page, parents before children. */
export function* walkBlocks(blocks = []) {
  for (const block of blocks) {
    yield block;
    if (block.blocks?.length) yield* walkBlocks(block.blocks);
  }
}

export const countBlocks = (content) => [...walkBlocks(content?.blocks ?? [])].length;

/** `<blockId>.<prop>` — stable while the block exists, gone with it. */
export const textKey = (blockId, prop) => `${blockId}.${prop}`;

/**
 * Concrete prop paths for a translatable pattern. `*` walks an array, so a block whose text lives
 * inside a list ('items.*.question') gets one key per item ('items.0.question').
 */
export function expandPropPath(props, pattern) {
  let paths = [''];
  for (const part of pattern.split('.')) {
    if (part === '*') {
      paths = paths.flatMap((path) => {
        const value = readProp(props, path);
        return Array.isArray(value) ? value.map((_, i) => (path ? `${path}.${i}` : String(i))) : [];
      });
    } else {
      paths = paths.map((path) => (path ? `${path}.${part}` : part));
    }
  }
  return paths;
}

const readProp = (props, path) =>
  path === '' ? props : path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), props);

/** Writes `value` at a dotted path, copying every container on the way (never mutates). */
function writeProp(props, path, value) {
  const parts = path.split('.');
  const out = Array.isArray(props) ? [...props] : { ...props };
  let target = out;
  for (const key of parts.slice(0, -1)) {
    const next = target[key];
    target[key] = Array.isArray(next) ? [...next] : { ...next };
    target = target[key];
  }
  target[parts.at(-1)] = value;
  return out;
}

/**
 * The customer-facing strings of a page, in registry order.
 * @returns {{ key: string, text: string }[]}
 */
export function collectTexts(content) {
  const out = [];
  for (const block of walkBlocks(content?.blocks ?? [])) {
    const definition = getBlock(block.type);
    for (const pattern of definition?.translatable ?? []) {
      for (const path of expandPropPath(block.props ?? {}, pattern)) {
        const text = readProp(block.props, path);
        if (typeof text === 'string' && text.trim())
          out.push({ key: textKey(block.id, path), text });
      }
    }
  }
  return out;
}

/**
 * Brings the page's `texts` in line with its blocks: new strings appear, changed English is
 * written to the source language (which marks the translation stale), text belonging to deleted
 * blocks goes away. Existing translations and manual overrides are left alone.
 * @param {object} content
 * @param {{ key: string, value: object }[]} existing
 * @returns {{ key: string, value: object }[]} the array to store
 */
export function syncTexts(content, existing = []) {
  const byKey = new Map(existing.map((t) => [t.key, t]));
  return collectTexts(content).map(({ key, text }) => {
    const current = byKey.get(key);
    if (!current) return { key, value: { en: text } };
    // Keep translations and meta; only the source changes here (staleness is the plugin's job).
    return { key, value: { ...current.value, en: text } };
  });
}

/**
 * The blocks as a visitor in `lang` should see them: every translatable prop replaced by its
 * translation, falling back to the English in `props`. Pure — the storefront and the admin
 * preview call it with the same page and different languages.
 *
 * A translation is used ONLY when it was made from the English these blocks actually carry. The
 * page's text list follows the DRAFT, so a published page whose draft has moved on (or whose
 * English was edited and not yet re-translated) shows its own English rather than a translation
 * of something else — a visitor never reads a sentence the shop did not publish.
 */
export function localizeBlocks(blocks = [], texts = [], lang) {
  const byKey = new Map((texts ?? []).map((t) => [t.key, t.value]));
  const localize = (list) =>
    list.map((block) => {
      const definition = getBlock(block.type);
      let props = { ...block.props };
      for (const pattern of definition?.translatable ?? []) {
        for (const path of expandPropPath(block.props ?? {}, pattern)) {
          const value = byKey.get(textKey(block.id, path));
          const source = readProp(block.props, path) ?? '';
          const translated =
            value && (value.en ?? '') === source ? resolveLocalized(value, lang) : '';
          if (translated) props = writeProp(props, path, translated);
        }
      }
      return {
        ...block,
        props,
        ...(block.blocks?.length ? { blocks: localize(block.blocks) } : {}),
      };
    });
  return localize(blocks);
}

/**
 * Brings an older page up to the current schema. Nothing to do yet — the hook exists so the first
 * breaking block change has an obvious home (and pages already saved keep working).
 * @param {object} content
 */
export function migratePageContent(content) {
  if (!content || content.schemaVersion === PAGE_SCHEMA_VERSION) return content;
  return { ...content, schemaVersion: PAGE_SCHEMA_VERSION };
}
