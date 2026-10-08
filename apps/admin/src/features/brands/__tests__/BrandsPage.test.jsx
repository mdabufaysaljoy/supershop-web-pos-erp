import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { BrandsPage } from '../pages/BrandsPage';

const BRAND = {
  id: '64b000000000000000000001',
  name: 'Nike',
  slug: 'nike',
  description: { en: 'Sportswear' },
  logo: null,
  website: 'https://nike.example',
  isActive: true,
  protectName: true,
  seo: { title: { en: '' }, description: { en: '' } },
};

function setup(routes, initial = '/brands') {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions: ['brand.manage'] },
  });
  const m = mockFetch({
    'GET /api/v1/brands': () =>
      json(200, { data: [BRAND], meta: { page: 1, limit: 25, total: 60 } }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[initial]}>
        <BrandsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('Brands page', () => {
  it('lists, searches and paginates through the URL', async () => {
    const m = setup({});
    expect(await screen.findByRole('button', { name: 'Nike' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(m.calls.at(-1).url.searchParams.get('page')).toBe('2'));
    await userEvent.type(screen.getByRole('searchbox'), 'ni{Enter}');
    await waitFor(() => {
      const { searchParams } = m.calls.at(-1).url;
      expect([searchParams.get('q'), searchParams.get('page')]).toEqual(['ni', '1']);
    });
  });

  it('creates a brand; protect-name defaults on; bad website caught client-side', async () => {
    const m = setup({
      'POST /api/v1/brands': () => json(201, { data: { ...BRAND, id: 'x', name: 'Apple' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Add brand' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Brand name/), 'Apple');
    expect(within(dialog).getByLabelText(/^Never translate this name/)).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText(/^Never translate this name/));
    await userEvent.type(within(dialog).getByLabelText('Website'), 'not a url');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(m.count('POST /api/v1/brands')).toBe(0);
    expect(within(dialog).getByLabelText('Website')).toHaveAttribute('aria-invalid', 'true');

    await userEvent.clear(within(dialog).getByLabelText('Website'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(m.count('POST /api/v1/brands')).toBe(1));
    const body = JSON.parse(m.calls.find((c) => c.key === 'POST /api/v1/brands').init.body);
    expect(body).toMatchObject({ name: 'Apple', protectName: false, website: null, logoId: null });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows a server NAME_TAKEN error inline', async () => {
    setup({
      'PATCH /api/v1/brands/64b000000000000000000001': () =>
        json(409, {
          error: {
            code: 'NAME_TAKEN',
            message: 'x',
            details: [{ path: 'name', message: 'validation.duplicate' }],
          },
        }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Nike' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Already in use.')).toBeInTheDocument();
  });
});
