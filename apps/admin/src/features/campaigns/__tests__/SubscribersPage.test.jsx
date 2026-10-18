import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { SubscribersPage } from '../pages/SubscribersPage';

const SUBSCRIBER_1 = {
  id: 'sub-1',
  email: 'customer@example.com',
  status: 'subscribed',
  source: 'storefront_newsletter',
  subscribedAt: '2026-10-15T12:00:00.000Z',
  unsubscribedAt: null,
};

const SUBSCRIBER_2 = {
  id: 'sub-2',
  email: 'unsub@example.com',
  status: 'unsubscribed',
  source: 'storefront_newsletter',
  subscribedAt: '2026-10-10T12:00:00.000Z',
  unsubscribedAt: '2026-10-12T12:00:00.000Z',
};

function setupAuth(permissions = ['campaign.view', 'campaign.manage']) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'token-123',
    profile: { name: 'Admin Staff' },
    access: {
      isSuperAdmin: true,
      permissions,
      can: (p) => permissions.includes(p),
      assert: (p) => permissions.includes(p),
      scope: { allBranches: true, branchIds: [] },
    },
  });
}

function renderWithProviders(ui, { route = '/subscribers' } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/subscribers" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Subscribers Admin UI (P7.3)', () => {
  beforeEach(() => {
    setupAuth();
  });

  it('renders subscriber list, metrics, and badges', async () => {
    mockFetch({
      'GET /api/v1/subscribers': json(200, {
        data: [SUBSCRIBER_1, SUBSCRIBER_2],
        meta: {
          total: 2,
          page: 1,
          limit: 25,
          totalPages: 1,
          activeCount: 1,
          unsubscribedCount: 1,
        },
      }),
    });

    renderWithProviders(<SubscribersPage />);

    expect(await screen.findByText('customer@example.com')).toBeInTheDocument();
    expect(screen.getByText('unsub@example.com')).toBeInTheDocument();

    // Check KPI counters
    expect(screen.getByText('Total Subscribers')).toBeInTheDocument();
    expect(screen.getByText('Active Subscribed')).toBeInTheDocument();
    expect(screen.getAllByText('Unsubscribed').length).toBeGreaterThanOrEqual(1);
  });

  it('toggles a subscriber status between subscribed and unsubscribed', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      'GET /api/v1/subscribers': json(200, {
        data: [SUBSCRIBER_1],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1, activeCount: 1, unsubscribedCount: 0 },
      }),
      'PATCH /api/v1/subscribers/sub-1': json(200, {
        data: { ...SUBSCRIBER_1, status: 'unsubscribed' },
      }),
    });

    renderWithProviders(<SubscribersPage />);

    expect(await screen.findByText('customer@example.com')).toBeInTheDocument();
    const unsubBtn = screen.getByRole('button', { name: 'Unsubscribe' });
    await user.click(unsubBtn);

    await waitFor(() => {
      expect(fetchMock.count('PATCH /api/v1/subscribers/sub-1')).toBe(1);
    });
  });

  it('deletes a subscriber with confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const fetchMock = mockFetch({
      'GET /api/v1/subscribers': json(200, {
        data: [SUBSCRIBER_1],
        meta: { total: 1, page: 1, limit: 25, totalPages: 1, activeCount: 1, unsubscribedCount: 0 },
      }),
      'DELETE /api/v1/subscribers/sub-1': json(200, {
        data: { success: true },
      }),
    });

    renderWithProviders(<SubscribersPage />);

    expect(await screen.findByText('customer@example.com')).toBeInTheDocument();
    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(fetchMock.count('DELETE /api/v1/subscribers/sub-1')).toBe(1);
    });
  });
});
