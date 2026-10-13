import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '@/test/fetchMock';
import { useAuthStore } from '../store';
import { LoginPage } from '../pages/LoginPage';

function renderLogin(entry = '/login') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '*', element: <p>landed:{'x'}</p> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const fill = async (email, password) => {
  if (email) await userEvent.type(screen.getByLabelText('Email'), email);
  if (password) await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

beforeEach(() =>
  useAuthStore.setState({ status: 'anonymous', accessToken: null, profile: null, access: null }),
);
afterEach(() => vi.unstubAllGlobals());

describe('LoginPage', () => {
  it('validates with the shared schema and shows translated messages (no request sent)', async () => {
    const m = mockFetch({});
    renderLogin();
    await fill('not-an-email', '');
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(m.fn).not.toHaveBeenCalled();
  });

  it('uses correct input types/autocomplete', () => {
    mockFetch({});
    renderLogin();
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('shows the translated server error code', async () => {
    mockFetch({
      'POST /api/v1/auth/staff/login': json(423, {
        error: { code: 'ACCOUNT_LOCKED', message: 'locked' },
      }),
    });
    renderLogin();
    await fill('sara@shop.test', 'whatever-pass');
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily locked');
  });

  it('signs in, loads profile + access, and goes to a SAFE next path', async () => {
    const m = mockFetch({
      'POST /api/v1/auth/staff/login': json(200, {
        data: { accessToken: 'tok', profile: { name: 'Sara' } },
      }),
      'GET /api/v1/auth/staff/me': json(200, { data: { name: 'Sara Admin' } }),
      'GET /api/v1/staff/me/access': json(200, { data: { permissions: ['pos.sell'] } }),
    });
    const router = renderLogin(`/login?next=${encodeURIComponent('//evil.com')}`);
    await fill('SARA@shop.test', 'correct-horse-9');
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'tok',
      profile: { name: 'Sara Admin' },
      access: { permissions: ['pos.sell'] },
    });
    // Email normalized by the shared schema before sending.
    expect(JSON.parse(m.calls[0].init.body)).toEqual({
      email: 'sara@shop.test',
      password: 'correct-horse-9',
    });
    expect(m.calls[1].init.headers.Authorization).toBe('Bearer tok');
  });
});
