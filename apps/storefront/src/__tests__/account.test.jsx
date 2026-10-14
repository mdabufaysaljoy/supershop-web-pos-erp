// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/dictionaries/en.json';
import { I18nProvider } from '@/i18n/I18nProvider';
import { pickNamespaces } from '@/i18n/translate';

/** P3.5 — the customer account area in the browser. */
const replace = vi.fn();
let search = new URLSearchParams();
let pathname = '/account';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => pathname,
}));

const { AuthProvider } = await import('@/components/account/AuthProvider');
const { CartProvider } = await import('@/components/cart/CartProvider');
const { SignInForm } = await import('@/components/account/SignInForm');
const { AddressBook } = await import('@/components/account/AddressBook');
const { OrderHistory } = await import('@/components/account/OrderHistory');
const { AccountShell } = await import('@/components/account/AccountShell');

const FMT = {
  lang: 'en',
  digits: 'latn',
  timeZone: 'Asia/Riyadh',
  calendar: 'gregorian',
  currency: 'SAR',
};
const PROFILE = {
  id: 'c1',
  name: 'Sara Ali',
  email: 'sara@example.com',
  phone: '+966512345678',
  emailVerified: true,
  lang: 'en',
  addresses: [],
};
const ADDRESS = { city: 'Riyadh', line1: 'King Fahd Rd 12', postalCode: '12345' };
const SAVED = [{ id: 'a1', label: 'Home', address: ADDRESS, isDefault: true }];

const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
const unauthenticated = () => json(401, { error: { code: 'UNAUTHENTICATED' } });

/**
 * @param {{ signedIn?: boolean, routes?: Record<string, () => Promise<Response>> }} opts
 *   `routes` is matched by "METHOD /path" prefix.
 */
function setup(ui, { signedIn = true, routes = {} } = {}) {
  const fetchMock = vi.fn((url, init) => {
    const method = init?.method ?? 'GET';
    const u = String(url);
    const route = Object.keys(routes).find((k) => `${method} ${u}`.startsWith(k));
    if (route) return routes[route](u, init);
    if (u.startsWith('/api/v1/cart')) return json(200, { data: { items: [], totals: {} } });
    if (u.startsWith('/api/v1/auth/customer/refresh'))
      return signedIn ? json(200, { data: { accessToken: 'at-1' } }) : unauthenticated();
    if (u.startsWith('/api/v1/account'))
      return signedIn ? json(200, { data: PROFILE }) : unauthenticated();
    return json(404, { error: { code: 'NOT_FOUND' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <I18nProvider lang="en" dict={pickNamespaces(en)}>
      <CartProvider fmtOptions={FMT}>
        <AuthProvider>{ui}</AuthProvider>
      </CartProvider>
    </I18nProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
  search = new URLSearchParams();
  pathname = '/account';
});

describe('signing in', () => {
  it('sends the credentials and returns the visitor to where they were going', async () => {
    search = new URLSearchParams('returnTo=/checkout');
    const login = vi.fn(() =>
      json(200, { data: { accessToken: 'at-1', profile: PROFILE, tokenType: 'Bearer' } }),
    );
    const m = setup(<SignInForm googleEnabled={false} />, {
      signedIn: false,
      routes: { 'POST /api/v1/auth/customer/login': login },
    });

    await userEvent.type(screen.getByLabelText(/Email or mobile number/), 'sara@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'my-secret-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/checkout'));
    expect(JSON.parse(login.mock.calls[0][1].body)).toEqual({
      identifier: 'sara@example.com',
      password: 'my-secret-pass-1',
    });
    // The cart is re-read after signing in: the API merges the guest cart into the customer's.
    expect(
      m.mock.calls.filter(([u]) => String(u).startsWith('/api/v1/cart')).length,
    ).toBeGreaterThan(1);
  });

  it('shows one message for a wrong password and never says whether the account exists', async () => {
    setup(<SignInForm googleEnabled={false} />, {
      signedIn: false,
      routes: {
        'POST /api/v1/auth/customer/login': () =>
          json(401, { error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials' } }),
      },
    });
    await userEvent.type(screen.getByLabelText(/Email or mobile number/), 'ghost@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'wrong-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email, mobile number or password is not right.',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('offers Google only when the shop enabled it', async () => {
    const { unmount } = { unmount: () => {} };
    setup(<SignInForm googleEnabled />, { signedIn: false });
    const google = screen.getByRole('link', { name: /Continue with Google/ });
    expect(google).toHaveAttribute(
      'href',
      '/api/v1/auth/customer/google/start?returnTo=%2Faccount',
    );
    unmount();
  });
});

describe('guarded pages', () => {
  it('sends a guest to sign in and remembers the page they wanted', async () => {
    pathname = '/account/orders';
    setup(
      <AccountShell title="Your orders">
        <p>secret</p>
      </AccountShell>,
      { signedIn: false },
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/account/login?returnTo=%2Faccount%2Forders'),
    );
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});

describe('address book', () => {
  it('lists saved addresses and adds a new one', async () => {
    const added = vi.fn(() =>
      json(201, {
        data: [...SAVED, { id: 'a2', label: 'Work', address: ADDRESS, isDefault: false }],
      }),
    );
    setup(<AddressBook />, {
      routes: {
        'GET /api/v1/account/addresses': () => json(200, { data: SAVED }),
        'POST /api/v1/account/addresses': added,
      },
    });

    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    await userEvent.type(screen.getByLabelText(/Name this address/), 'Work');
    await userEvent.type(screen.getByLabelText(/Street and building/), 'Olaya St 7');
    await userEvent.type(screen.getByLabelText(/^City/), 'Riyadh');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(added).toHaveBeenCalled());
    expect(JSON.parse(added.mock.calls[0][1].body)).toMatchObject({
      label: 'Work',
      address: { city: 'Riyadh', line1: 'Olaya St 7' },
    });
    expect(await screen.findByText('Work')).toBeInTheDocument();
  });

  it('keeps the form open and explains when the server rejects the address', async () => {
    setup(<AddressBook />, {
      routes: {
        'GET /api/v1/account/addresses': () => json(200, { data: [] }),
        'POST /api/v1/account/addresses': () =>
          json(400, {
            error: {
              code: 'VALIDATION_ERROR',
              details: [{ path: 'address.city', message: 'validation.tooShort' }],
            },
          }),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Add an address' }));
    await userEvent.type(screen.getByLabelText(/Street and building/), 'Olaya St 7');
    await userEvent.type(screen.getByLabelText(/^City/), 'Riy');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // The field keeps its own message and the form says the save failed; nothing is lost.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toContain('Too short.');
    expect(screen.getByLabelText(/^City/)).toHaveValue('Riy');
  });
});

describe('order history', () => {
  const ORDERS = [
    {
      id: 'o1',
      orderNo: 'ORD-000007',
      status: 'processing',
      placedAt: '2026-10-13T09:00:00.000Z',
      itemCount: 2,
      total: 25300,
      currency: 'SAR',
      payment: { method: 'cod', status: 'pending' },
      items: [{ name: 'Oxford Shirt', image: null, qty: 2 }],
    },
  ];

  it('shows past orders with their status and total', async () => {
    setup(<OrderHistory />, {
      routes: {
        'GET /api/v1/account/orders': () => json(200, { data: ORDERS, meta: { total: 1 } }),
      },
    });
    expect(await screen.findByRole('link', { name: 'ORD-000007' })).toHaveAttribute(
      'href',
      '/account/orders/o1',
    );
    expect(screen.getByText('Being prepared')).toBeInTheDocument();
    expect(screen.getByText('SAR 253.00')).toBeInTheDocument();
    expect(screen.getByText('Oxford Shirt')).toBeInTheDocument();
  });

  it('invites a customer with no orders to start shopping', async () => {
    setup(<OrderHistory />, {
      routes: { 'GET /api/v1/account/orders': () => json(200, { data: [], meta: { total: 0 } }) },
    });
    expect(await screen.findByText('You have not placed an order yet.')).toBeInTheDocument();
  });
});
