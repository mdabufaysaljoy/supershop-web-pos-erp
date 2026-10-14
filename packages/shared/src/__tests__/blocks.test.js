import { describe, expect, it } from 'vitest';
import {
  blockPalette,
  blockTypes,
  collectTexts,
  countBlocks,
  defineBlock,
  getBlock,
  localizeBlocks,
  migratePageContent,
  PAGE_SCHEMA_VERSION,
  pageContentSchema,
  syncTexts,
} from '../index.js';

/** P5.1 — the page builder's vocabulary and the document it produces. */
const page = (...blocks) => pageContentSchema.parse({ blocks });
const heading = (id, text) => ({ id, type: 'heading', props: { text } });

describe('the registry', () => {
  it('declares each block once, with its text props', () => {
    expect(blockTypes()).toContain('heading');
    expect(getBlock('heading').translatable).toEqual(['text']);
    expect(getBlock('spacer').translatable).toEqual([]);
    expect(getBlock('nope')).toBeNull();
    expect(blockPalette().every((b) => b.type && b.defaults)).toBe(true);
  });

  it('refuses a second definition of the same type, or text with no schema', () => {
    expect(() => defineBlock({ type: 'heading', props: {} })).toThrow(/already defined/);
    expect(() => defineBlock({ type: 'test-bad', props: {}, translatable: ['missing'] })).toThrow(
      /translatable prop/,
    );
  });
});

describe('a page document', () => {
  it('fills a block in from its defaults and stamps the version it was built with', () => {
    const parsed = page(heading('blk-1', 'Welcome'));
    expect(parsed).toMatchObject({ schemaVersion: PAGE_SCHEMA_VERSION });
    expect(parsed.blocks[0]).toEqual({
      id: 'blk-1',
      type: 'heading',
      version: 1,
      props: { text: 'Welcome', level: 'h2', align: 'start' },
    });
  });

  it('refuses an unknown block, an unknown prop and a bad value', () => {
    expect(() => page({ id: 'blk-1', type: 'carousel', props: {} })).toThrow();
    expect(() => page({ id: 'blk-1', type: 'heading', props: { text: 'x', nope: 1 } })).toThrow();
    expect(() =>
      page({ id: 'blk-1', type: 'heading', props: { text: '', level: 'h9' } }),
    ).toThrow();
  });

  it('says WHERE a block is wrong, so the builder can point at the field', () => {
    const result = pageContentSchema.safeParse({
      blocks: [
        { id: 'blk-1', type: 'buttonLink', props: { label: 'Go', href: 'javascript:alert(1)' } },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toEqual(['blocks', 0, 'props', 'href']);
  });

  it('insists on unique ids across the whole page', () => {
    expect(() => page(heading('blk-1', 'a'), heading('blk-1', 'b'))).toThrow();
  });

  it('counts every block, nested ones included', () => {
    const content = page(heading('blk-1', 'a'), { id: 'blk-2', type: 'spacer', props: {} });
    expect(countBlocks(content)).toBe(2);
  });
});

describe('the text a customer reads', () => {
  const content = () =>
    page(heading('blk-1', 'Welcome'), {
      id: 'blk-2',
      type: 'buttonLink',
      props: { label: 'Shop now', href: '/search' },
    });

  it('is collected from the props the registry marks translatable', () => {
    expect(collectTexts(content())).toEqual([
      { key: 'blk-1.text', text: 'Welcome' },
      { key: 'blk-2.label', text: 'Shop now' },
    ]);
  });

  it('keeps translations when the English is unchanged, and follows it when it changes', () => {
    const existing = [
      {
        key: 'blk-1.text',
        value: { en: 'Welcome', ar: 'مرحبا', meta: { ar: { mode: 'auto', status: 'done' } } },
      },
    ];
    const same = syncTexts(content(), existing);
    expect(same[0].value).toMatchObject({ en: 'Welcome', ar: 'مرحبا' });

    const edited = syncTexts(page(heading('blk-1', 'Welcome back')), existing);
    // The source changes here; marking the Arabic stale is the translation plugin's job.
    expect(edited[0].value).toMatchObject({ en: 'Welcome back', ar: 'مرحبا' });
  });

  it('forgets text whose block is gone', () => {
    const existing = [{ key: 'blk-9.text', value: { en: 'Old', ar: 'قديم' } }];
    expect(syncTexts(content(), existing).map((t) => t.key)).toEqual(['blk-1.text', 'blk-2.label']);
  });

  it('ignores empty strings — there is nothing to translate', () => {
    expect(collectTexts(page({ id: 'blk-1', type: 'richText', props: { html: '   ' } }))).toEqual(
      [],
    );
  });
});

describe('rendering in a language', () => {
  const content = () =>
    page(heading('blk-1', 'Welcome'), { id: 'blk-2', type: 'spacer', props: {} });
  const texts = [{ key: 'blk-1.text', value: { en: 'Welcome', ar: 'مرحبا' } }];

  it('swaps in the translation and leaves everything else alone', () => {
    const [headingBlock, spacer] = localizeBlocks(content().blocks, texts, 'ar');
    expect(headingBlock.props).toEqual({ text: 'مرحبا', level: 'h2', align: 'start' });
    expect(spacer.props).toEqual({ size: 'md' });
  });

  it('falls back to the English in the props when a translation is missing', () => {
    expect(localizeBlocks(content().blocks, [], 'ar')[0].props.text).toBe('Welcome');
    expect(localizeBlocks(content().blocks, texts, 'en')[0].props.text).toBe('Welcome');
  });

  it('ignores a translation made from different English', () => {
    // The page's text follows the draft; a published page must not borrow the draft's Arabic.
    const stale = [{ key: 'blk-1.text', value: { en: 'Welcome back', ar: 'مرحبا بعودتك' } }];
    expect(localizeBlocks(content().blocks, stale, 'ar')[0].props.text).toBe('Welcome');
  });

  it('never mutates the page it was given', () => {
    const original = content();
    localizeBlocks(original.blocks, texts, 'ar');
    expect(original.blocks[0].props.text).toBe('Welcome');
  });
});

describe('schema versions', () => {
  it('stamps the current version and leaves a current page alone', () => {
    const current = page(heading('blk-1', 'a'));
    expect(migratePageContent(current)).toBe(current);
    expect(migratePageContent({ schemaVersion: 0, blocks: [] })).toMatchObject({
      schemaVersion: PAGE_SCHEMA_VERSION,
    });
  });
});
