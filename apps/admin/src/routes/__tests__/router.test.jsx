import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { routes } from '../router';

function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const signIn = (permissions, extra = {}) =>
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'Cara Cashier', email: 'cara@shop.test' },
    access: { permissions, isSuperAdmin: false, ...extra },
  });

beforeEach(() => {
  // Layout keeps access fresh; answer with the current store value.
  mockFetch({
    'GET /api/v1/staff/me/access': () => json(200, { data: useAuthStore.getState().access }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('route guards', () => {
  it('anonymous users are sent to login with a safe `next`', async () => {
    useAuthStore.setState({ status: 'anonymous', accessToken: null, profile: null, access: null });
    const router = renderAt('/orders?page=2');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/orders?page=2')}`);
  });

  it('menu shows only permitted sections', async () => {
    signIn(['pos.sell', 'order.view']);
    renderAt('/orders');
    const nav = await screen.findAllByRole('navigation');
    expect(nav[0]).toHaveTextContent('Orders');
    expect(nav[0]).toHaveTextContent('Point of sale');
    expect(nav[0]).not.toHaveTextContent('Settings');
    expect(nav[0]).not.toHaveTextContent('Dashboard');
  });

  it('a route without permission shows Access denied (even via direct URL)', async () => {
    signIn(['pos.sell']);
    renderAt('/settings');
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });

  it('home redirects users without dashboard access to their first section', async () => {
    signIn(['order.view']);
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Orders' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/orders');
  });

  it('home explains when a user has no permissions at all', async () => {
    signIn([]);
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'No sections yet' })).toBeInTheDocument();
  });

  it('dashboard greets the user; unknown paths 404 inside the shell', async () => {
    signIn(['dashboard.view']);
    renderAt('/');
    expect(
      await screen.findByRole('heading', { name: 'Welcome, Cara Cashier' }),
    ).toBeInTheDocument();
    renderAt('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('sign out clears the session and returns to a plain login (regression: no `next` leak)', async () => {
    signIn(['order.view']);
    const m = mockFetch({
      'GET /api/v1/staff/me/access': json(200, { data: { permissions: ['order.view'] } }),
      'POST /api/v1/auth/staff/logout': () => new Response(null, { status: 204 }),
    });
    const router = renderAt('/orders');
    await userEvent.click(await screen.findByRole('button', { name: /Cara Cashier/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(router.state.location.search).toBe(''); // no `next`: the next user starts fresh
    expect(
      m.calls.find((c) => c.key === 'POST /api/v1/auth/staff/logout').init.headers[
        'X-CSRF-Protection'
      ],
    ).toBe('1');
  });
});
