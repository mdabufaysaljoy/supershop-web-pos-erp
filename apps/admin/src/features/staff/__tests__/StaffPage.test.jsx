import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { StaffPage } from '../pages/StaffPage';

const BRANCH = { id: '64b000000000000000000001', code: 'RUH-01', name: { en: 'Riyadh Olaya' } };
const OTHER_BRANCH = { id: '64b000000000000000000002', code: 'JED-01', name: { en: 'Jeddah' } };
const CASHIER_ROLE = {
  id: '64d000000000000000000001',
  name: 'Cashier',
  description: 'Sells at the till.',
  permissions: ['pos.sell'],
  allBranches: false,
};
const HQ_ROLE = {
  id: '64d000000000000000000002',
  name: 'Accountant',
  description: 'Reads the money, everywhere.',
  permissions: ['report.view'],
  allBranches: true,
};
const SARA = {
  id: '64c000000000000000000001',
  name: 'Sara Ali',
  email: 'sara@shop.test',
  phone: null,
  status: 'active',
  roleId: CASHIER_ROLE.id,
  branchIds: [BRANCH.id],
  isSuperAdmin: false,
};
const ME = { id: '64c0000000000000000000ff', staffId: '64c0000000000000000000ff' };

const MANAGE = ['staff.view', 'staff.manage'];

function setup(routes = {}, { permissions = MANAGE, isSuperAdmin = true, list = [SARA] } = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { id: ME.id, name: 'Root' },
    access: { staffId: ME.staffId, permissions, isSuperAdmin, allBranches: true, branchIds: [] },
  });
  const m = mockFetch({
    'GET /api/v1/staff': () => json(200, { data: list, meta: { page: 1, limit: 20, total: 1 } }),
    'GET /api/v1/roles': () => json(200, { data: [CASHIER_ROLE, HQ_ROLE] }),
    'GET /api/v1/inventory/branches': () => json(200, { data: [BRANCH, OTHER_BRANCH] }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <StaffPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.find((c) => c.key === key).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Staff', () => {
  it('lists who may sign in, with the role and branches they were given', async () => {
    setup();
    const row = (await screen.findByRole('button', { name: 'Sara Ali' })).closest('tr');
    expect(within(row).getByText('sara@shop.test')).toBeInTheDocument();
    expect(within(row).getByText('Cashier')).toBeInTheDocument();
    expect(within(row).getByText('1 branch')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('creates an account with a role and the branches it works in', async () => {
    const user = userEvent.setup();
    const m = setup({ 'POST /api/v1/staff': () => json(201, { data: SARA }) });
    await user.click(await screen.findByRole('button', { name: 'Add a staff member' }));
    const dialog = within(screen.getByRole('dialog'));

    await user.type(dialog.getByLabelText(/^Full name/), 'Omar Saleh');
    await user.type(dialog.getByLabelText(/^Email/), 'omar@shop.test');
    await user.type(dialog.getByLabelText(/^Password/), 'Str0ng-Passw0rd!');
    await user.selectOptions(dialog.getByLabelText('Role'), CASHIER_ROLE.id);
    await user.click(dialog.getByLabelText('Riyadh Olaya'));
    await user.click(dialog.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(m.count('POST /api/v1/staff')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/staff')).toMatchObject({
      name: 'Omar Saleh',
      email: 'omar@shop.test',
      roleId: CASHIER_ROLE.id,
      branchIds: [BRANCH.id],
      isSuperAdmin: false,
    });
  });

  it('stops asking for branches once the role covers every one of them', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Add a staff member' }));
    const dialog = within(screen.getByRole('dialog'));

    await user.selectOptions(dialog.getByLabelText('Role'), HQ_ROLE.id);
    expect(dialog.getByText('This role covers every branch.')).toBeInTheDocument();
    expect(dialog.getByLabelText('Riyadh Olaya')).toBeDisabled();
  });

  it('disables an account instead of deleting it, and can sign it out everywhere', async () => {
    const user = userEvent.setup();
    const m = setup({
      'PATCH /api/v1/staff/64c000000000000000000001': () => json(200, { data: SARA }),
      'POST /api/v1/staff/64c000000000000000000001/sessions/revoke': () => json(204, {}),
    });
    await user.click(await screen.findByRole('button', { name: 'Sara Ali' }));
    const dialog = within(screen.getByRole('dialog'));

    await user.click(dialog.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() =>
      expect(m.count('POST /api/v1/staff/64c000000000000000000001/sessions/revoke')).toBe(1),
    );

    await user.selectOptions(dialog.getByLabelText('Status'), 'disabled');
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/staff/64c000000000000000000001')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/staff/64c000000000000000000001').status).toBe('disabled');
  });

  it('will not let anyone edit their own access', async () => {
    const user = userEvent.setup();
    const me = { ...SARA, id: ME.id, name: 'Root' };
    setup({}, { list: [me] });
    await user.click(await screen.findByRole('button', { name: 'Root' }));
    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.getByText(/your own account/i)).toBeInTheDocument();
    expect(dialog.getByLabelText('Role')).toBeDisabled();
    expect(dialog.getByLabelText('Status')).toBeDisabled();
    expect(dialog.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Sign out everywhere' })).toBeNull();
  });

  it('shows the list without an editor to someone who may only view staff', async () => {
    setup({}, { permissions: ['staff.view'], isSuperAdmin: false });
    expect(await screen.findByText('Sara Ali')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a staff member' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sara Ali' })).toBeNull();
  });
});
