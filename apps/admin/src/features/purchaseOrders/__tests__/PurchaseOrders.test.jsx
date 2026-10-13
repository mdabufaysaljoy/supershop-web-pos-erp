import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { PurchaseOrderEditorPage } from '../pages/PurchaseOrderEditorPage';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

const SUPPLIER = { id: '64a000000000000000000001', name: 'Gulf Trading', isActive: true };
const BRANCH = { id: '64b000000000000000000001', code: 'RUH', name: { en: 'Riyadh' } };
const RED = {
  id: '64c000000000000000000001',
  sku: 'OX-RED',
  productName: { en: 'Oxford Shirt' },
  options: [{ name: { en: 'Color' }, value: { en: 'Red' } }],
  cost: 4000,
};
const RICE = {
  ...RED,
  id: '64c000000000000000000002',
  sku: 'RICE-5',
  productName: { en: 'Rice' },
  options: [],
};
const ORDER = {
  id: '64d000000000000000000001',
  poNo: 'PO-000007',
  status: 'partially_received',
  supplier: { id: SUPPLIER.id, name: 'Gulf Trading' },
  branch: BRANCH,
  expectedAt: '2026-11-01',
  reference: 'Q-1',
  note: '',
  totals: { ordered: 74_000, received: 20_000, units: 30, unitsReceived: 4 },
  lines: [
    {
      variantId: RED.id,
      variant: RED,
      qtyOrdered: 10,
      qtyReceived: 4,
      unitCost: 5000,
      total: 50_000,
    },
    {
      variantId: RICE.id,
      variant: RICE,
      qtyOrdered: 20,
      qtyReceived: 0,
      unitCost: 1200,
      total: 24_000,
    },
  ],
  receipts: [
    {
      operationId: 'op1',
      docNo: 'GRN-000003',
      units: 4,
      value: 20_000,
      at: '2026-10-10T08:00:00Z',
    },
  ],
  updatedAt: '2026-10-10T08:00:00Z',
};
const ALL = ['purchase.view', 'purchase.manage', 'inventory.receive', 'branch.view'];

function setup(routes, { path = '/purchase-orders', permissions = ALL } = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/purchase-orders': () =>
      json(200, { data: [{ ...ORDER, lines: undefined }], meta: { total: 1 } }),
    [`GET /api/v1/purchase-orders/${ORDER.id}`]: () => json(200, { data: ORDER }),
    'GET /api/v1/suppliers': () => json(200, { data: [SUPPLIER], meta: { total: 1 } }),
    'GET /api/v1/branches': () => json(200, { data: [BRANCH] }),
    'GET /api/v1/products/variants': () => json(200, { data: [RED, RICE] }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/purchase-orders/new" element={<PurchaseOrderEditorPage />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}
const bodyOf = (m, key) => JSON.parse(m.calls.findLast((c) => c.key === key).init.body);

afterEach(() => vi.unstubAllGlobals());

describe('Purchase orders list', () => {
  it('shows number, supplier, total and progress', async () => {
    setup({});
    expect(await screen.findByRole('link', { name: 'PO-000007' })).toBeInTheDocument();
    expect(screen.getByText('4 of 30')).toBeInTheDocument();
    expect(screen.getByText('Partially received', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New purchase order' })).toBeInTheDocument();
  });

  it('hides "new" without purchase.manage', async () => {
    setup({}, { permissions: ['purchase.view'] });
    await screen.findByRole('link', { name: 'PO-000007' });
    expect(screen.queryByRole('link', { name: 'New purchase order' })).toBeNull();
  });
});

describe('Purchase order editor', () => {
  it('drafts an order: picker adds variants with their cost, money sent in halalas', async () => {
    const m = setup(
      { 'POST /api/v1/purchase-orders': () => json(201, { data: { ...ORDER, status: 'draft' } }) },
      { path: '/purchase-orders/new' },
    );
    await screen.findByRole('option', { name: 'Gulf Trading' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Supplier/ }), SUPPLIER.id);
    await screen.findByRole('option', { name: 'RUH · Riyadh' });
    await userEvent.selectOptions(screen.getByLabelText(/^Deliver to branch/), BRANCH.id);
    await userEvent.type(screen.getByLabelText('Expected delivery'), '2026-11-20');

    await userEvent.type(screen.getByRole('searchbox'), 'ox{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Add OX-RED' }));
    expect(screen.queryByRole('button', { name: 'Add OX-RED' })).toBeNull();
    const qty = screen.getByLabelText('Quantity for OX-RED');
    await userEvent.clear(qty);
    await userEvent.type(qty, '12');
    const cost = screen.getByLabelText('Unit cost for OX-RED');
    expect(cost).toHaveValue('40.00');
    await userEvent.clear(cost);
    await userEvent.type(cost, '45.5');
    expect(screen.getAllByText(/546\.00/)).toHaveLength(2); // line + order total

    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(m.count('POST /api/v1/purchase-orders')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/purchase-orders')).toMatchObject({
      supplierId: SUPPLIER.id,
      branchId: BRANCH.id,
      expectedAt: '2026-11-20',
      lines: [{ variantId: RED.id, qty: 12, unitCost: 4550 }],
    });
  });

  it('shows schema errors before sending', async () => {
    const m = setup({}, { path: '/purchase-orders/new' });
    await screen.findByRole('option', { name: 'Gulf Trading' });
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(screen.getByRole('combobox', { name: /^Supplier/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(m.count('POST /api/v1/purchase-orders')).toBe(0);
  });

  it('receives goods with an idempotency key; received lines keep their cost', async () => {
    const m = setup(
      {
        [`POST /api/v1/purchase-orders/${ORDER.id}/receive`]: () =>
          json(200, { data: { ...ORDER, status: 'received' } }),
      },
      { path: `/purchase-orders/${ORDER.id}` },
    );
    expect(await screen.findByLabelText('Unit cost for OX-RED')).toBeDisabled();
    expect(screen.getByLabelText('Unit cost for RICE-5')).toBeEnabled();
    expect(screen.getByText('GRN-000003')).toBeInTheDocument();
    // Can't cancel once goods arrived; can close.
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close order' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Receive goods' }));
    const dialog = screen.getByRole('dialog');
    const red = within(dialog).getByLabelText(/OX-RED/);
    expect(red).toHaveValue('6');
    await userEvent.clear(within(dialog).getByLabelText(/RICE-5/));
    await userEvent.type(within(dialog).getByLabelText(/^Delivery note/), 'DN-9');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to stock' }));
    const key = `POST /api/v1/purchase-orders/${ORDER.id}/receive`;
    await waitFor(() => expect(m.count(key)).toBe(1));
    expect(bodyOf(m, key)).toEqual({
      lines: [{ variantId: RED.id, qty: 6 }],
      reference: 'DN-9',
    });
    const call = m.calls.find((c) => c.key === key);
    expect(call.init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is read-only for viewers', async () => {
    setup({}, { path: `/purchase-orders/${ORDER.id}`, permissions: ['purchase.view'] });
    expect(await screen.findByLabelText('Quantity for RICE-5')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Receive goods' })).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
