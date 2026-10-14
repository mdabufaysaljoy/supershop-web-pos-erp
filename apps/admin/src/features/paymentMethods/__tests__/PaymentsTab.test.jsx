import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';

/** P4.2 — Settings → Payments: what the shop accepts, in which order, at what fee. */
/** The body of the last call to a route (later calls are cache refetches without one). */
const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);
const METHODS = [
  {
    id: 'm1',
    key: 'cod',
    type: 'cod',
    label: { en: 'Cash payment on delivery' },
    instructions: { en: 'Pay the courier when your order arrives.' },
    enabled: true,
    position: 0,
    fee: { fixed: 0, bps: 0 },
    minTotal: null,
    maxTotal: null,
    builtIn: true,
  },
  {
    id: 'm2',
    key: 'card',
    type: 'gateway',
    label: { en: 'Card, Mada or Apple Pay' },
    instructions: { en: '' },
    enabled: false,
    position: 1,
    fee: { fixed: 0, bps: 0 },
    minTotal: null,
    maxTotal: null,
    builtIn: true,
  },
];
const SETTINGS = [
  { key: 'payments.gateway', group: 'payments', value: 'none', editable: true },
  {
    key: 'payments.moyasar.secretKey',
    group: 'payments',
    value: { isSet: false, masked: '' },
    secret: true,
  },
  {
    key: 'payments.moyasar.webhookSecret',
    group: 'payments',
    value: { isSet: false, masked: '' },
    secret: true,
  },
];

function setup(permissions, extraRoutes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/payment-methods': json(200, { data: METHODS }),
    'GET /api/v1/settings': json(200, { data: SETTINGS }),
    ...extraRoutes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/settings?tab=payments']}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('Settings → Payments', () => {
  it('lists the shop’s methods with their type and whether they are offered', async () => {
    setup(['settings.view', 'settings.payments']);
    expect(await screen.findByText('Cash payment on delivery')).toBeInTheDocument();
    expect(screen.getByText('Card, Mada or Apple Pay')).toBeInTheDocument();
    expect(screen.getAllByText('Built in')).toHaveLength(2);
    const [cod, card] = screen.getAllByRole('checkbox', { name: 'Offer it' });
    expect(cod).toBeChecked();
    expect(card).not.toBeChecked();
  });

  it('switches a method on with one click', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.payments'], {
      'PATCH /api/v1/payment-methods/m2': ({ init }) =>
        json(200, { data: { ...METHODS[1], ...JSON.parse(init.body) } }),
    });
    await screen.findByText('Card, Mada or Apple Pay');
    await user.click(screen.getAllByRole('checkbox', { name: 'Offer it' })[1]);
    await waitFor(() => expect(m.count('PATCH /api/v1/payment-methods/m2')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/payment-methods/m2')).toEqual({ enabled: true });
  });

  it('saves a fee in halalas from what the admin types in riyals', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.payments'], {
      'PATCH /api/v1/payment-methods/m1': ({ init }) =>
        json(200, { data: { ...METHODS[0], ...JSON.parse(init.body) } }),
    });
    const row = (await screen.findByText('Cash payment on delivery')).closest('li');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    await user.clear(within(row).getByLabelText('Fixed fee'));
    await user.type(within(row).getByLabelText('Fixed fee'), '5.00');
    await user.clear(within(row).getByLabelText(/Percentage fee/));
    await user.type(within(row).getByLabelText(/Percentage fee/), '2.5');
    expect(
      within(row).getByText('On a 200.00 SAR basket this adds 10.00 SAR.'),
    ).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/payment-methods/m1')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/payment-methods/m1')).toMatchObject({
      fee: { fixed: 500, bps: 250 },
      minTotal: null,
      maxTotal: null,
    });
  });

  it('reorders the list by sending every method in the new order', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.payments'], {
      'POST /api/v1/payment-methods/reorder': json(200, { data: [METHODS[1], METHODS[0]] }),
    });
    await screen.findByText('Card, Mada or Apple Pay');
    await user.click(screen.getAllByRole('button', { name: 'Move up' })[1]);
    await waitFor(() => expect(m.count('POST /api/v1/payment-methods/reorder')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/payment-methods/reorder')).toEqual({ ids: ['m2', 'm1'] });
  });

  it('adds a method the shop collects itself, deriving the key from the name', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.payments'], {
      'POST /api/v1/payment-methods': ({ init }) =>
        json(201, { data: { ...METHODS[0], id: 'm3', ...JSON.parse(init.body) } }),
    });
    await screen.findByText('Add your own method');
    await user.type(screen.getByLabelText(/^Name customers see/), 'Bank transfer');
    await user.type(screen.getByLabelText(/^How to pay/), 'IBAN SA00 0000');
    await user.click(screen.getByRole('button', { name: 'Add method' }));
    await waitFor(() => expect(m.count('POST /api/v1/payment-methods')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/payment-methods')).toMatchObject({
      key: 'bank-transfer',
      label: 'Bank transfer',
      instructions: 'IBAN SA00 0000',
    });
  });

  it('read-only staff can look but not touch', async () => {
    setup(['settings.view']);
    await screen.findByText('Cash payment on delivery');
    for (const box of screen.getAllByRole('checkbox', { name: 'Offer it' }))
      expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add method' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Move up' })[1]).toBeDisabled();
  });

  it('never shows a stored gateway key, only that one is set', async () => {
    setup(['settings.view', 'settings.payments'], {
      'GET /api/v1/settings': json(200, {
        data: [
          SETTINGS[0],
          { ...SETTINGS[1], value: { isSet: true, masked: 'sk_t…1234' } },
          SETTINGS[2],
        ],
      }),
    });
    expect(await screen.findByText('Stored: sk_t…1234')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Secret key/)).toHaveValue('');
    expect(screen.getByText('Not set yet.')).toBeInTheDocument(); // the webhook secret
  });
});
