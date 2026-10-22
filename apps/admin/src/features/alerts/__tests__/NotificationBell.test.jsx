import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { NotificationBell } from '../components/NotificationBell';

const SALE = {
  id: 'a1',
  type: 'order.online',
  title: 'New online order ORD-000042',
  body: '2 items · SAR 450.00',
  link: '/orders/o1',
  entity: { type: 'order', id: 'o1' },
  read: false,
  at: '2026-10-22T09:00:00.000Z',
};
const NOTICE = {
  id: 'a2',
  type: 'shop.notice',
  title: 'The shop is open',
  body: '',
  link: null,
  entity: null,
  read: true,
  at: '2026-10-22T08:00:00.000Z',
};

function setup(feed = { items: [SALE, NOTICE], unread: 1 }, routes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions: ['order.view'] },
  });
  const m = mockFetch({
    'GET /api/v1/alerts': () => json(200, { data: feed }),
    'POST /api/v1/alerts/read': () => json(204, undefined),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/']}>
        <Toaster />
        <NotificationBell />
        <Routes>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/orders/:id" element={<h1>Order page</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('the notification bell', () => {
  it('wears a dot while anything is unread, and says so to a screen reader', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
  });

  it('lists what the shop has been told, newest first', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    const list = within(await screen.findByRole('menu'));
    expect(list.getByText('New online order ORD-000042')).toBeInTheDocument();
    expect(list.getByText('2 items · SAR 450.00')).toBeInTheDocument();
    expect(list.getByText('The shop is open')).toBeInTheDocument();
  });

  it('opens the thing it is about, and marks that one read', async () => {
    const user = userEvent.setup();
    const m = setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByText('New online order ORD-000042'));

    expect(await screen.findByRole('heading', { name: 'Order page' })).toBeInTheDocument();
    await waitFor(() => expect(m.count('POST /api/v1/alerts/read')).toBe(1));
    const sent = m.calls.filter((c) => c.key === 'POST /api/v1/alerts/read').at(-1);
    expect(JSON.parse(sent.init.body)).toEqual({ ids: ['a1'] });
  });

  it('marks the lot read when asked', async () => {
    const user = userEvent.setup();
    const m = setup();
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(m.count('POST /api/v1/alerts/read')).toBe(1));
    const sent = m.calls.filter((c) => c.key === 'POST /api/v1/alerts/read').at(-1);
    expect(JSON.parse(sent.init.body)).toEqual({});
  });

  it('shows nothing to open when there is nothing to report', async () => {
    const user = userEvent.setup();
    setup({ items: [], unread: 0 });
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('Nothing to report.')).toBeInTheDocument();
  });

  it('pops up a sale that arrives while the admin is open — and not the backlog', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let feed = { items: [NOTICE], unread: 0 };
    setup(undefined, { 'GET /api/v1/alerts': () => json(200, { data: feed }) });

    // What was already there when the admin opened raises nothing.
    await screen.findByRole('button', { name: /Notifications/ });
    expect(screen.queryByText('New online order ORD-000042')).toBeNull();

    // A sale comes in: the next poll brings it, and it is announced.
    feed = { items: [SALE, NOTICE], unread: 1 };
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await screen.findByText('New online order ORD-000042')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
