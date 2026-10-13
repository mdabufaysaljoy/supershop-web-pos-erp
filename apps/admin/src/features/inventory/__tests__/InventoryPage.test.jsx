import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { InventoryPage } from '../pages/InventoryPage';

const RUH = { id: '64b000000000000000000001', code: 'RUH', name: { en: 'Riyadh' } };
const JED = { id: '64b000000000000000000002', code: 'JED', name: { en: 'Jeddah' } };
const RED = {
  id: '64c000000000000000000001',
  sku: 'OX-RED',
  productName: { en: 'Oxford Shirt' },
  options: [{ name: { en: 'Color' }, value: { en: 'Red' } }],
};
const RICE = {
  ...RED,
  id: '64c000000000000000000002',
  sku: 'RICE-5',
  productName: { en: 'Rice' },
  options: [],
};
const level = (variant, branch, onHand, extra = {}) => ({
  id: `${variant.id}-${branch.id}`,
  variant,
  branch,
  onHand,
  lowStockThreshold: null,
  threshold: 5,
  isLow: onHand <= 5,
  isOut: onHand <= 0,
  lastMovementAt: '2026-10-12T10:00:00Z',
  ...extra,
});
const LEVELS = [level(RED, RUH, 2), level(RICE, RUH, 40, { lowStockThreshold: 10, threshold: 10 })];
const MOVEMENT = {
  id: 'm1',
  operationId: '64e000000000000000000001',
  docNo: 'ADJ-000004',
  reason: 'damaged',
  type: 'adjust',
  variant: RED,
  branch: RUH,
  delta: -3,
  balanceAfter: 2,
  actor: { id: 's1', name: 'Sara Ali' },
  createdAt: '2026-10-12T10:00:00Z',
};
const ALL = ['inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.receive'];

function setup(routes = {}, { permissions = ALL, path = '/inventory' } = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions, allBranches: true, branchIds: [] },
  });
  const m = mockFetch({
    'GET /api/v1/inventory/branches': () => json(200, { data: [RUH, JED] }),
    'GET /api/v1/inventory/levels': () => json(200, { data: LEVELS, meta: { total: 2 } }),
    'GET /api/v1/inventory/movements': () => json(200, { data: [MOVEMENT], meta: { total: 1 } }),
    [`GET /api/v1/inventory/variants/${RED.id}/levels`]: () =>
      json(200, { data: [level(RED, RUH, 10), level(RED, JED, 1)], meta: { total: 11 } }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <InventoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.findLast((c) => c.key === key).init.body);
const lastQuery = (m, key) => m.calls.findLast((c) => c.key === key).url.searchParams;

afterEach(() => vi.unstubAllGlobals());

describe('Inventory page', () => {
  it('lists stock with status and own/default low levels; filters go to the API', async () => {
    const m = setup();
    const row = (await screen.findByText('OX-RED')).closest('tr');
    expect(within(row).getByText('Low')).toBeInTheDocument();
    expect(within(row).getByText('(default)')).toBeInTheDocument();
    const rice = screen.getByText('RICE-5').closest('tr');
    expect(within(rice).getByText('In stock')).toBeInTheDocument();
    expect(within(rice).queryByText('(default)')).toBeNull();

    await userEvent.click(screen.getByLabelText('Low stock only'));
    await waitFor(() =>
      expect(lastQuery(m, 'GET /api/v1/inventory/levels').get('low')).toBe('true'),
    );
    await userEvent.selectOptions(screen.getByLabelText('Branch'), JED.id);
    await waitFor(() =>
      expect(lastQuery(m, 'GET /api/v1/inventory/levels').get('branchId')).toBe(JED.id),
    );
  });

  it('view-only users get no stock actions', async () => {
    setup({}, { permissions: ['inventory.view'] });
    await screen.findByText('OX-RED');
    expect(screen.queryByRole('button', { name: 'Adjust' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Adjust OX-RED/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Movement history of OX-RED/ })).toBeInTheDocument();
  });

  it('adjusts from a row: prefilled item and branch, signed change, idempotency key, short-stock error', async () => {
    let short = true;
    const m = setup({
      'POST /api/v1/inventory/adjust': () =>
        short
          ? json(409, {
              error: {
                code: 'INSUFFICIENT_STOCK',
                message: 'x',
                details: [
                  {
                    path: 'lines.0.delta',
                    message: 'validation.quantity.insufficient',
                    available: 10,
                  },
                ],
              },
            })
          : json(201, { data: { id: 'op', docNo: 'ADJ-000005' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust OX-RED in RUH' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('10 on hand now')).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Reason/), 'expired');
    const change = within(dialog).getByLabelText('Change for OX-RED');
    await userEvent.type(change, '-1x2');
    expect(change).toHaveValue('-12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(await within(dialog).findByText('Only 10 available.')).toBeInTheDocument();
    expect(bodyOf(m, 'POST /api/v1/inventory/adjust')).toEqual({
      branchId: RUH.id,
      reason: 'expired',
      lines: [{ variantId: RED.id, delta: -12 }],
    });
    const keys = () =>
      m.calls
        .filter((c) => c.key === 'POST /api/v1/inventory/adjust')
        .map((c) => c.init.headers['Idempotency-Key']);

    short = false;
    await userEvent.clear(change);
    await userEvent.type(change, '-2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Same dialog → same key (a retry can never book twice).
    expect(new Set(keys()).size).toBe(1);
  });

  it('stock count shows the difference and sends counted quantities', async () => {
    const m = setup({
      'GET /api/v1/products/variants': () => json(200, { data: [RED] }),
      'POST /api/v1/inventory/adjust': () => json(201, { data: { id: 'op', docNo: 'ADJ-000006' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Stock count' }));
    const dialog = screen.getByRole('dialog');
    // Browsers ignore a <form> nested in a <form> (Enter would submit the dialog), so none may exist.
    expect(dialog.querySelectorAll('form form')).toHaveLength(0);
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Branch/), RUH.id);
    await userEvent.type(within(dialog).getByRole('searchbox'), 'ox{Enter}');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Add OX-RED' }));
    await userEvent.type(within(dialog).getByLabelText('Counted quantity of OX-RED'), '8');
    expect(await within(dialog).findByText('(-2)')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save count' }));
    await waitFor(() => expect(m.count('POST /api/v1/inventory/adjust')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/inventory/adjust')).toEqual({
      branchId: RUH.id,
      reason: 'count',
      lines: [{ variantId: RED.id, counted: 8 }],
    });
  });

  it('transfers between branches; the destination excludes the source', async () => {
    const m = setup({
      'GET /api/v1/products/variants': () => json(200, { data: [RED] }),
      'POST /api/v1/inventory/transfer': () =>
        json(201, { data: { id: 'op', docNo: 'TRF-000001' } }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Transfer' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^From branch/), RUH.id);
    const to = within(dialog).getByLabelText(/^To branch/);
    expect(within(to).queryByRole('option', { name: /RUH/ })).toBeNull();
    await userEvent.selectOptions(to, JED.id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    expect(within(dialog).getByText('This field is required.')).toBeInTheDocument(); // no items
    await userEvent.type(within(dialog).getByRole('searchbox'), 'ox{Enter}');
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Add OX-RED' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity to transfer of OX-RED'), '3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer' }));
    await waitFor(() => expect(m.count('POST /api/v1/inventory/transfer')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/inventory/transfer')).toEqual({
      fromBranchId: RUH.id,
      toBranchId: JED.id,
      lines: [{ variantId: RED.id, qty: 3 }],
    });
  });

  it('movements show the ledger with who did it; a document opens with its rows', async () => {
    setup(
      {
        [`GET /api/v1/inventory/operations/${MOVEMENT.operationId}`]: () =>
          json(200, {
            data: {
              id: MOVEMENT.operationId,
              type: 'adjust',
              docNo: 'ADJ-000004',
              reason: 'damaged',
              branch: RUH,
              actor: { name: 'Sara Ali' },
              note: 'Water damage',
              createdAt: MOVEMENT.createdAt,
              movements: [MOVEMENT],
            },
          }),
      },
      { path: '/inventory?tab=movements' },
    );
    const row = (await screen.findByText('Sara Ali')).closest('tr');
    expect(within(row).getByText('-3')).toBeInTheDocument();
    expect(within(row).getByText('Damaged')).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'ADJ-000004' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Water damage')).toBeInTheDocument();
  });

  it('sets a per-item low-stock level or reverts to the default', async () => {
    const m = setup({
      'PUT /api/v1/inventory/levels/threshold': () => json(200, { data: LEVELS[1] }),
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Low-stock level of RICE-5 in RUH' }),
    );
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Alert when stock is at or below');
    expect(input).toHaveValue('10');
    await userEvent.click(within(dialog).getByLabelText(/^Use the store default/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(m.count('PUT /api/v1/inventory/levels/threshold')).toBe(1));
    expect(bodyOf(m, 'PUT /api/v1/inventory/levels/threshold')).toEqual({
      branchId: RUH.id,
      variantId: RICE.id,
      lowStockThreshold: null,
    });
  });
});
