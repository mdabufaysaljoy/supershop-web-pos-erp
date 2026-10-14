import { pageContentSchema, syncTexts } from '@supershop/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BlockRenderer, CORE_BLOCK_COMPONENTS, PagePreview } from '../index.js';

/** P5.1 — one renderer for the storefront and the admin preview. */
const content = pageContentSchema.parse({
  blocks: [
    { id: 'blk-1', type: 'heading', props: { text: 'Welcome', level: 'h1' } },
    {
      id: 'blk-2',
      type: 'richText',
      props: { html: '<p>Everyday <strong>essentials</strong>.</p>' },
    },
    { id: 'blk-3', type: 'buttonLink', props: { label: 'Shop now', href: '/search' } },
    { id: 'blk-4', type: 'spacer', props: { size: 'lg' } },
  ],
});
const texts = [
  { key: 'blk-1.text', value: { en: 'Welcome', ar: 'مرحبا' } },
  { key: 'blk-3.label', value: { en: 'Shop now', ar: 'تسوق الآن' } },
];

describe('BlockRenderer', () => {
  it('draws each block with its registered component', () => {
    render(<BlockRenderer blocks={content.blocks} components={CORE_BLOCK_COMPONENTS} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByText('essentials')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/search');
  });

  it('skips a block it does not know instead of breaking the page', () => {
    const onUnknown = vi.fn();
    render(
      <BlockRenderer
        blocks={[{ id: 'blk-9', type: 'fromTheFuture', props: {} }, ...content.blocks]}
        components={CORE_BLOCK_COMPONENTS}
        onUnknown={onUnknown}
      />,
    );
    expect(onUnknown).toHaveBeenCalledWith(expect.objectContaining({ type: 'fromTheFuture' }));
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
  });

  it('lets the page decide where links and images come from', () => {
    render(
      <BlockRenderer
        blocks={[
          {
            id: 'blk-3',
            type: 'buttonLink',
            props: { label: 'Shop now', href: '/search', variant: 'primary' },
          },
          { id: 'blk-5', type: 'image', props: { mediaId: 'm1', alt: 'A shirt', width: 'full' } },
        ]}
        components={CORE_BLOCK_COMPONENTS}
        context={{
          langPrefix: '/ar',
          media: { m1: { url: 'https://cdn.test/shirt.webp', width: 800, height: 600 } },
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Shop now' })).toHaveAttribute('href', '/ar/search');
    expect(screen.getByAltText('A shirt')).toHaveAttribute('src', 'https://cdn.test/shirt.webp');
  });

  it('leaves out an image whose media is gone', () => {
    render(
      <BlockRenderer
        blocks={[{ id: 'blk-5', type: 'image', props: { mediaId: 'missing', alt: 'x' } }]}
        components={CORE_BLOCK_COMPONENTS}
        context={{ media: {} }}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('PagePreview', () => {
  it('shows the page in English and switches the whole thing to Arabic', async () => {
    const user = userEvent.setup();
    render(<PagePreview content={content} texts={texts} components={CORE_BLOCK_COMPONENTS} />);

    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    const group = within(screen.getByRole('group', { name: 'Preview' }));
    expect(group.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(group.getByRole('button', { name: 'العربية' }));
    expect(screen.getByRole('heading', { name: 'مرحبا' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تسوق الآن' })).toBeInTheDocument();
    // The direction follows the language: an RTL layout problem shows up here, not in production.
    expect(screen.getByRole('heading', { name: 'مرحبا' }).closest('[dir]')).toHaveAttribute(
      'dir',
      'rtl',
    );
  });

  it('falls back to the English a page was written in when nothing is translated yet', async () => {
    const user = userEvent.setup();
    render(
      <PagePreview
        content={content}
        texts={syncTexts(content)}
        components={CORE_BLOCK_COMPONENTS}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'العربية' }));
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
  });
});
