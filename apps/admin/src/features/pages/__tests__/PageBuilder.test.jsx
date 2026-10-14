import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { PageBuilderPage } from '../pages/PageBuilderPage';

/** P5.2 — the builder: blocks on, blocks moved, props edited, undone, saved. */
const PAGE = {
  id: 'pg1',
  slug: 'about-us',
  title: { en: 'About us' },
  status: 'draft',
  isHome: false,
  draft: {
    schemaVersion: 1,
    blocks: [
      {
        id: 'blk-1',
        type: 'heading',
        version: 1,
        props: { text: 'Welcome', level: 'h1', align: 'start' },
      },
      {
        id: 'blk-2',
        type: 'buttonLink',
        version: 1,
        props: { label: 'Shop now', href: '/search', variant: 'primary' },
      },
    ],
  },
  published: null,
  texts: [
    {
      key: 'blk-1.text',
      value: { en: 'Welcome', ar: 'مرحبا', meta: { ar: { mode: 'auto', status: 'done' } } },
    },
    { key: 'blk-2.label', value: { en: 'Shop now', ar: 'تسوق الآن' } },
  ],
  seo: {},
  blockCount: 2,
  versions: [],
  publishedAt: null,
  updatedAt: '2026-10-14T08:00:00.000Z',
};

const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);

function setup({
  permissions = ['page.view', 'page.manage', 'page.publish'],
  routes = {},
  page = PAGE,
} = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  let current = structuredClone(page);
  const m = mockFetch({
    'GET /api/v1/pages/pg1': () => json(200, { data: current }),
    'PATCH /api/v1/pages/pg1': ({ init }) => {
      current = { ...current, draft: JSON.parse(init.body).draft };
      return json(200, { data: current });
    },
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/pages/pg1']}>
        <Routes>
          <Route path="/pages/:id" element={<PageBuilderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

/** The builder loads its page first; everything else waits for the canvas to exist. */
const openBuilder = async () => within(await screen.findByRole('region', { name: 'Page' }));
const canvas = () => within(screen.getByRole('region', { name: 'Page' }));
const panel = () => within(screen.getByRole('complementary', { name: 'Block settings' }));

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('the canvas', () => {
  it('draws the page with the storefront’s own renderer', async () => {
    setup();
    const page = await openBuilder();
    expect(page.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(page.getByRole('link', { name: 'Shop now' })).toBeInTheDocument();
  });

  it('shows the page in Arabic, right to left, without touching what is stored', async () => {
    const user = userEvent.setup();
    const m = setup();
    await openBuilder();
    await user.click(screen.getByRole('button', { name: 'العربية' }));

    expect(canvas().getByRole('heading', { name: 'مرحبا' })).toBeInTheDocument();
    expect(canvas().getByRole('list')).toHaveAttribute('dir', 'rtl');
    expect(m.count('PATCH /api/v1/pages/pg1')).toBe(0); // looking is not editing
  });
});

describe('building', () => {
  it('adds a block from the palette and saves it by itself', async () => {
    const user = userEvent.setup();
    const m = setup();
    await openBuilder();

    await user.click(screen.getByRole('button', { name: 'Space' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/pages/pg1')).toBe(1), { timeout: 4000 });
    const saved = bodyOf(m, 'PATCH /api/v1/pages/pg1').draft.blocks;
    expect(saved).toHaveLength(3);
    expect(saved.at(-1)).toMatchObject({ type: 'spacer', props: { size: 'md' } });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('edits the selected block through a panel generated from the registry', async () => {
    const user = userEvent.setup();
    const m = setup();
    await openBuilder();
    await user.click(canvas().getByRole('button', { name: 'Select the Heading block' }));

    // The fields come from the block's own declaration — no per-block form was written.
    expect(panel().getByLabelText('Text')).toHaveValue('Welcome');
    expect(panel().getByLabelText('Size')).toHaveValue('h1');

    await user.clear(panel().getByLabelText('Text'));
    await user.type(panel().getByLabelText('Text'), 'Hello');
    await user.selectOptions(panel().getByLabelText('Size'), 'h2');

    await waitFor(() => expect(m.count('PATCH /api/v1/pages/pg1')).toBeGreaterThan(0), {
      timeout: 4000,
    });
    const blocks = bodyOf(m, 'PATCH /api/v1/pages/pg1').draft.blocks;
    expect(blocks[0].props).toMatchObject({ text: 'Hello', level: 'h2' });
  });

  it('shows the generated Arabic for a text prop, read-only', async () => {
    const user = userEvent.setup();
    setup();
    await openBuilder();
    await user.click(canvas().getByRole('button', { name: 'Select the Heading block' }));
    const arabic = panel().getByText('مرحبا');
    expect(arabic).toHaveAttribute('dir', 'rtl');
    expect(arabic.tagName).not.toBe('INPUT');
  });

  it('removes a block, and undo brings it back', async () => {
    const user = userEvent.setup();
    setup();
    await openBuilder();

    await user.click(canvas().getAllByRole('button', { name: 'Remove this block' })[0]);
    expect(canvas().queryByRole('heading', { name: 'Welcome' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(canvas().getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(canvas().queryByRole('heading', { name: 'Welcome' })).toBeNull();
  });

  it('starts with nothing to undo', async () => {
    setup();
    await openBuilder();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('duplicates a block right after the original', async () => {
    const user = userEvent.setup();
    const m = setup();
    await openBuilder();
    await user.click(canvas().getAllByRole('button', { name: 'Duplicate this block' })[0]);

    await waitFor(() => expect(m.count('PATCH /api/v1/pages/pg1')).toBe(1), { timeout: 4000 });
    const blocks = bodyOf(m, 'PATCH /api/v1/pages/pg1').draft.blocks;
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'heading', 'buttonLink']);
    expect(blocks[0].id).not.toBe(blocks[1].id); // ids stay unique: they key the translations
  });
});

describe('publishing', () => {
  it('saves what is on screen before it goes live', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'POST /api/v1/pages/pg1/publish': json(200, { data: { ...PAGE, status: 'published' } }),
      },
    });
    await openBuilder();
    await user.click(screen.getByRole('button', { name: 'Space' }));
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(m.count('POST /api/v1/pages/pg1/publish')).toBe(1), {
      timeout: 4000,
    });
    const saveIndex = m.calls.findIndex((c) => c.key === 'PATCH /api/v1/pages/pg1');
    const publishIndex = m.calls.findIndex((c) => c.key === 'POST /api/v1/pages/pg1/publish');
    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(saveIndex).toBeLessThan(publishIndex);
  });
});

describe('permissions', () => {
  it('lets a viewer look without changing anything', async () => {
    setup({ permissions: ['page.view'] });
    await openBuilder();
    expect(screen.getByRole('button', { name: 'Space' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
