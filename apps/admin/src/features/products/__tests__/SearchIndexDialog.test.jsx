import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { SearchIndexDialog } from '../components/SearchIndexDialog';

afterEach(() => vi.unstubAllGlobals());

describe('Search index dialog', () => {
  it('shows status, rebuilds, and previews storefront results per language', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 't',
      profile: { name: 'A' },
      access: { permissions: ['product.update'] },
    });
    let rebuilding = false;
    const m = mockFetch({
      'GET /api/v1/search/status': () =>
        json(200, { data: { driver: 'mongo', documents: 42, rebuilding, lastRebuild: null } }),
      'POST /api/v1/search/rebuild': () => {
        rebuilding = true;
        return json(202, { data: { driver: 'mongo', documents: 42, rebuilding } });
      },
      'GET /api/v1/search': ({ url }) =>
        json(200, {
          data:
            url.searchParams.get('q') === 'rice'
              ? [{ id: 'p1', name: 'Basmati Rice', priceMin: 3450, image: null }]
              : [],
          meta: { total: 1 },
        }),
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SearchIndexDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('42 products indexed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rebuild index' }));
    expect(await screen.findByText('Rebuilding…')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Language'), 'ar');
    await userEvent.type(screen.getByRole('searchbox'), 'rice{Enter}');
    const list = await screen.findByRole('list', { name: 'Search results' });
    expect(list).toHaveTextContent('Basmati Rice');
    const call = m.calls.find((c) => c.key === 'GET /api/v1/search');
    expect([call.url.searchParams.get('lang'), call.init.headers.Authorization]).toEqual([
      'ar',
      undefined,
    ]);
  });
});
