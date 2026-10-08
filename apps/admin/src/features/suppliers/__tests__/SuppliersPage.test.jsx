import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { SuppliersPage } from '../pages/SuppliersPage';

const SUPPLIER = {
  id: '64b000000000000000000001',
  name: 'Gulf Foods',
  contactName: 'Sara Ali',
  phone: '+966551234567',
  email: 'buy@gulf.example',
  address: null,
  taxNumber: null,
  registrationNumber: null,
  paymentTermsDays: 1,
  notes: '',
  isActive: true,
};

function setup(routes, permissions = ['supplier.manage']) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/suppliers': () =>
      json(200, { data: [SUPPLIER], meta: { page: 1, limit: 25, total: 1 } }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <SuppliersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

afterEach(() => vi.unstubAllGlobals());

describe('Suppliers page', () => {
  it('lists suppliers with contact columns and plural terms', async () => {
    setup({});
    expect(await screen.findByRole('button', { name: 'Gulf Foods' })).toBeInTheDocument();
    expect(screen.getByText('+966551234567')).toBeInTheDocument();
    expect(screen.getByText('1 day')).toBeInTheDocument();
  });

  it('read-only viewers get no add/edit controls', async () => {
    setup({}, ['purchase.view']);
    expect(await screen.findByText('Gulf Foods')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gulf Foods' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add supplier' })).toBeNull();
  });

  it('creates with keystroke-filtered fields and the shared schema', async () => {
    const m = setup({
      'POST /api/v1/suppliers': () => json(201, { data: { ...SUPPLIER, id: 'x' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Add supplier' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Company name/), 'Al Noor');
    await userEvent.type(within(dialog).getByLabelText('Contact person'), 'Omar1 Saleh');
    await userEvent.type(within(dialog).getByLabelText(/^Phone/), '05x5 123 4567');
    await userEvent.type(within(dialog).getByLabelText('Payment terms (days)'), '3a0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(m.count('POST /api/v1/suppliers')).toBe(1));
    const body = JSON.parse(m.calls.find((c) => c.key === 'POST /api/v1/suppliers').init.body);
    expect(body).toMatchObject({
      name: 'Al Noor',
      contactName: 'Omar Saleh',
      phone: '+966551234567',
      email: null,
      paymentTermsDays: 30,
      isActive: true,
    });
  });
});
