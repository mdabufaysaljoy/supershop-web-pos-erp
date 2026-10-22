import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { RolesPage } from '../pages/RolesPage';

const CASHIER_ROLE = {
  id: '64d000000000000000000001',
  name: 'Cashier',
  description: 'Sells at the till in the branches they are assigned.',
  permissions: ['pos.sell', 'product.view'],
  allBranches: false,
  isSystem: true,
};
const CUSTOM_ROLE = {
  id: '64d000000000000000000002',
  name: 'Night shift',
  description: '',
  permissions: ['pos.sell'],
  allBranches: false,
  isSystem: false,
};
const REGISTRY = {
  groups: {
    pos: ['pos.sell', 'pos.discount', 'pos.refund'],
    product: ['product.view', 'product.create'],
  },
  all: ['pos.sell', 'pos.discount', 'pos.refund', 'product.view', 'product.create'],
};

const MANAGE = ['role.manage', 'pos.sell', 'pos.discount', 'product.view', 'product.create'];

function setup(
  routes = {},
  { permissions = MANAGE, isSuperAdmin = false, allBranches = true } = {},
) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions, isSuperAdmin, allBranches, branchIds: [] },
  });
  const m = mockFetch({
    'GET /api/v1/roles': () => json(200, { data: [CASHIER_ROLE, CUSTOM_ROLE] }),
    'GET /api/v1/roles/permissions': () => json(200, { data: REGISTRY }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <RolesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.find((c) => c.key === key).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Roles', () => {
  it('lists the roles a shop has, and marks the ready-made ones', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Cashier' })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'Cashier' }).closest('tr');
    expect(within(row).getByText('Ready-made')).toBeInTheDocument();
    expect(within(row).getByText('Assigned branches only')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument(); // permissions held
  });

  it('creates a role from the permission matrix, a whole area at a time', async () => {
    const user = userEvent.setup();
    const m = setup({ 'POST /api/v1/roles': () => json(201, { data: CUSTOM_ROLE }) });
    await user.click(await screen.findByRole('button', { name: 'Add a role' }));
    const dialog = within(screen.getByRole('dialog'));

    await user.type(dialog.getByLabelText(/^Role name/), 'Night shift');
    // "Select all" on an area ticks every permission in it.
    await user.click(dialog.getAllByRole('button', { name: 'Select all' })[1]);
    await user.click(dialog.getByLabelText('product.view'));
    await user.click(dialog.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(m.count('POST /api/v1/roles')).toBe(1));
    const sent = bodyOf(m, 'POST /api/v1/roles');
    expect(sent.name).toBe('Night shift');
    expect(sent.allBranches).toBe(false);
    // Everything under Products, less the one that was ticked back off.
    expect(sent.permissions.sort()).toEqual(['product.create']);
  });

  it('will not let an editor hand out access they do not hold themselves', async () => {
    const user = userEvent.setup();
    setup({}, { permissions: ['role.manage', 'pos.sell'] });
    await user.click(await screen.findByRole('button', { name: 'Add a role' }));
    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.getByLabelText('pos.sell')).toBeEnabled();
    // The API refuses this as PERMISSION_ESCALATION, so the box never offers it.
    expect(dialog.getByLabelText(/^pos\.refund/)).toBeDisabled();
    expect(dialog.getAllByText('You do not hold this permission yourself.').length).toBeGreaterThan(
      0,
    );
  });

  it('tunes a ready-made role but never offers to delete it', async () => {
    const user = userEvent.setup();
    const m = setup({
      'PATCH /api/v1/roles/64d000000000000000000001': () => json(200, { data: CASHIER_ROLE }),
    });
    await user.click(await screen.findByRole('button', { name: 'Cashier' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/ready-made roles/i)).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Delete' })).toBeNull();

    await user.click(dialog.getByLabelText('pos.discount'));
    await user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/roles/64d000000000000000000001')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/roles/64d000000000000000000001').permissions.sort()).toEqual([
      'pos.discount',
      'pos.sell',
      'product.view',
    ]);
  });

  it('shows the list read-only to someone who may not manage roles', async () => {
    setup({}, { permissions: ['staff.manage'] });
    expect(await screen.findByText('Cashier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cashier' })).toBeNull();
  });
});
