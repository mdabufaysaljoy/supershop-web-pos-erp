import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { MediaLibraryPage } from '../pages/MediaLibraryPage';

const variant = (w, h, name) => ({
  url: `http://api.test/media/2026/10/abc-${name}.webp`,
  width: w,
  height: h,
  bytes: 12_345,
});
const ITEM = {
  id: '64b000000000000000000001',
  name: 'red-shirt.png',
  alt: { en: 'Red shirt', ar: 'قميص', meta: { ar: { mode: 'auto', status: 'done' } } },
  mime: 'image/webp',
  width: 1200,
  height: 900,
  bytes: 120_000,
  url: variant(1200, 900, 'full').url,
  variants: { full: variant(1200, 900, 'full'), thumb: variant(320, 240, 'thumb') },
  createdAt: '2026-10-08T10:00:00.000Z',
};
const list = (items, total = items.length) =>
  json(200, { data: items, meta: { page: 1, limit: 40, total } });

function setup(routes) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions: ['media.manage'] },
  });
  const m = mockFetch(routes);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/media']}>
        <MediaLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('Media library', () => {
  it('lists thumbnails and searches via the API', async () => {
    const m = setup({ 'GET /api/v1/media': () => list([ITEM]) });
    const img = await screen.findByRole('img', { name: 'Red shirt' });
    expect(img).toHaveAttribute('src', ITEM.variants.thumb.url);
    expect(screen.getByText('1200 × 900 · 120 kB')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'shirt{Enter}');
    await waitFor(() => expect(m.calls.at(-1).url.searchParams.get('q')).toBe('shirt'));
  });

  it('uploads each chosen file as multipart and reports per-file results', async () => {
    const bodies = [];
    const m = setup({
      'GET /api/v1/media': () => list([]),
      'POST /api/v1/media': ({ init }) => {
        bodies.push(init.body);
        const file = init.body.get('file');
        if (file.name === 'bad.png') {
          return json(415, { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'x' } });
        }
        if (file.name === 'again.png') return json(200, { data: ITEM, meta: { duplicate: true } });
        return json(201, { data: ITEM });
      },
    });
    expect(await screen.findByText('No images yet. Upload some above.')).toBeInTheDocument();

    const files = ['ok.png', 'bad.png', 'again.png'].map(
      (name) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' }),
    );
    await userEvent.upload(screen.getByTestId('media-file-input'), files);

    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    expect(
      await screen.findByText("This file isn't a supported image (JPEG, PNG, WebP, GIF or AVIF)."),
    ).toBeInTheDocument();
    expect(await screen.findByText('Already in the library')).toBeInTheDocument();
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toBeInstanceOf(FormData);
    const post = m.calls.find((c) => c.key === 'POST /api/v1/media');
    expect(post.init.headers['Content-Type']).toBeUndefined(); // browser sets the boundary
    // list refreshed after the batch
    await waitFor(() => expect(m.count('GET /api/v1/media')).toBeGreaterThan(1));
  });

  it('edits alt text and deletes only after confirmation', async () => {
    const m = setup({
      'GET /api/v1/media': () => list([ITEM]),
      [`PATCH /api/v1/media/${ITEM.id}`]: () =>
        json(200, { data: { ...ITEM, alt: { en: 'Red cotton shirt' } } }),
      [`DELETE /api/v1/media/${ITEM.id}`]: () => new Response(null, { status: 204 }),
    });
    await userEvent.click(await screen.findByRole('button', { name: /red-shirt\.png/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('قميص')).toBeInTheDocument();
    expect(within(dialog).getByText('Translated')).toBeInTheDocument();

    const alt = within(dialog).getByLabelText('Alt text (English)');
    await userEvent.clear(alt);
    await userEvent.type(alt, 'Red cotton shirt');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count(`PATCH /api/v1/media/${ITEM.id}`)).toBe(1));
    const patch = m.calls.find((c) => c.key.startsWith('PATCH'));
    expect(JSON.parse(patch.init.body)).toEqual({ alt: 'Red cotton shirt' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(m.count(`DELETE /api/v1/media/${ITEM.id}`)).toBe(0);
    expect(within(dialog).getByText(/Remove from the library\?/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(m.count(`DELETE /api/v1/media/${ITEM.id}`)).toBe(1));
  });
});
