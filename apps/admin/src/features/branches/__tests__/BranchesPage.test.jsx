import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { BranchesPage } from '../pages/BranchesPage';

const ADDRESS = {
  buildingNumber: null,
  street: null,
  district: 'Olaya',
  city: 'Riyadh',
  postalCode: null,
  additionalNumber: null,
  shortAddress: null,
};
const BRANCH = {
  id: '64b000000000000000000001',
  code: 'RUH-01',
  name: { en: 'Riyadh Olaya' },
  type: 'store',
  address: ADDRESS,
  phone: null,
  email: null,
  location: null,
  isActive: true,
  fulfillsOnlineOrders: true,
  pickupEnabled: false,
  staffCount: 1,
};
const CASHIER = {
  id: '64c000000000000000000001',
  name: 'Sara Ali',
  email: 'sara@shop.test',
  status: 'active',
  branchIds: [BRANCH.id],
};
const NEW_HIRE = {
  ...CASHIER,
  id: '64c000000000000000000002',
  name: 'Omar Saleh',
  email: 'omar@shop.test',
  branchIds: [],
};

const MANAGE = ['branch.view', 'branch.manage', 'staff.view', 'staff.manage'];

function setup(routes, { permissions = MANAGE, allBranches = true } = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions, allBranches, branchIds: [] },
  });
  const m = mockFetch({
    'GET /api/v1/branches': () => json(200, { data: [BRANCH] }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <BranchesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.find((c) => c.key === key).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Branches page', () => {
  it('lists branches with location, staff count and flags', async () => {
    setup({});
    expect(await screen.findByRole('button', { name: 'Riyadh Olaya' })).toBeInTheDocument();
    expect(screen.getByText('RUH-01')).toBeInTheDocument();
    expect(screen.getByText('Olaya, Riyadh')).toBeInTheDocument();
    expect(screen.getByText('Online orders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Staff at Riyadh Olaya' })).toHaveTextContent('1');
  });

  it('branch-scoped managers edit but cannot add or delete; viewers only read', async () => {
    setup({}, { allBranches: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Riyadh Olaya' }));
    expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('viewers get no edit or staff controls', async () => {
    setup({}, { permissions: ['branch.view'] });
    expect(await screen.findByText('Riyadh Olaya')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riyadh Olaya' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Staff at/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add branch' })).toBeNull();
  });

  it('creates with normalized code, national address and coordinates', async () => {
    const m = setup({ 'POST /api/v1/branches': () => json(201, { data: { ...BRANCH, id: 'x' } }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Add branch' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'jed-02');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Jeddah Corniche');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'warehouse');
    await userEvent.type(within(dialog).getByLabelText('Building number'), '12a34');
    await userEvent.type(within(dialog).getByLabelText('Postal code'), '23511');
    await userEvent.type(within(dialog).getByLabelText(/^Short address/), 'jdda1234');
    await userEvent.type(within(dialog).getByLabelText('Latitude'), '21.5x4');
    await userEvent.type(within(dialog).getByLabelText('Longitude'), '39.17');
    await userEvent.click(within(dialog).getByLabelText(/^In-store pick-up/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(m.count('POST /api/v1/branches')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/branches')).toMatchObject({
      code: 'JED-02',
      name: 'Jeddah Corniche',
      type: 'warehouse',
      address: {
        buildingNumber: '1234',
        postalCode: '23511',
        shortAddress: 'JDDA1234',
        street: null,
      },
      location: { lat: 21.54, lng: 39.17 },
      pickupEnabled: true,
      isActive: true,
    });
  });

  it('shows client-side errors before sending (half a location, bad postal code)', async () => {
    const m = setup({});
    await userEvent.click(await screen.findByRole('button', { name: 'Add branch' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'X1');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Test');
    await userEvent.type(within(dialog).getByLabelText('Postal code'), '123');
    await userEvent.type(within(dialog).getByLabelText('Latitude'), '21');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByLabelText('Postal code')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Longitude')).toHaveAttribute('aria-invalid', 'true');
    expect(m.count('POST /api/v1/branches')).toBe(0);
  });

  it('assigns and removes staff from the staff dialog', async () => {
    const m = setup({
      'GET /api/v1/branches/64b000000000000000000001/staff': () => json(200, { data: [CASHIER] }),
      'GET /api/v1/staff': () => json(200, { data: [CASHIER, NEW_HIRE], meta: { total: 2 } }),
      'POST /api/v1/branches/64b000000000000000000001/staff': () => json(200, { data: NEW_HIRE }),
      'DELETE /api/v1/branches/64b000000000000000000001/staff/64c000000000000000000001': () =>
        json(200, { data: { ...CASHIER, branchIds: [] } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Staff at Riyadh Olaya' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('sara@shop.test')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole('searchbox'), 'o{Enter}');
    // Already-assigned staff are not offered again.
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Assign Omar Saleh to this branch' }),
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Assign Sara Ali to this branch' }),
    ).toBeNull();
    await waitFor(() =>
      expect(m.count('POST /api/v1/branches/64b000000000000000000001/staff')).toBe(1),
    );
    expect(bodyOf(m, 'POST /api/v1/branches/64b000000000000000000001/staff')).toEqual({
      staffId: NEW_HIRE.id,
    });

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove Sara Ali from this branch' }),
    );
    await waitFor(() =>
      expect(
        m.count('DELETE /api/v1/branches/64b000000000000000000001/staff/64c000000000000000000001'),
      ).toBe(1),
    );
  });
});
