import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { OrderDetailPage } from '../pages/OrderDetailPage';
import { OrdersPage } from '../pages/OrdersPage';

/** P4.4 — the orders screens: find one, see it, move it along, print it. */
const ROW = {
  id: 'o1',
  orderNo: 'ORD-000007',
  status: 'processing',
  channel: 'online',
  placedAt: '2026-10-13T09:00:00.000Z',
  customer: { name: 'Sara Ali', phone: '+966512345678' },
  itemCount: 2,
  total: 25300,
  currency: 'SAR',
  payment: { method: 'cod', status: 'pending' },
  shipped: false,
};
const DETAIL = {
  ...ROW,
  lang: 'en',
  customer: { name: 'Sara Ali', phone: '+966512345678', email: 'sara@example.com' },
  address: { line1: 'King Fahd Rd 12', city: 'Riyadh', district: null, postalCode: '12345' },
  items: [
    {
      productId: 'p1',
      variantId: 'v1',
      sku: 'OX-1',
      name: 'Oxford Shirt',
      options: [{ name: 'Color', value: 'Red' }],
      unitPrice: 11500,
      qty: 2,
      lineTotal: 23000,
      image: null,
    },
  ],
  totals: {
    itemCount: 2,
    subtotal: 23000,
    deliveryFee: 2300,
    paymentFee: 0,
    net: 22000,
    vat: 3300,
    total: 25300,
  },
  payment: {
    method: 'cod',
    type: 'cod',
    label: 'Cash payment on delivery',
    fee: 0,
    status: 'pending',
  },
  shipment: null,
  shipments: [],
  notes: [],
  note: 'Call on arrival',
  statusHistory: [
    {
      at: '2026-10-13T10:00:00.000Z',
      from: 'pending',
      to: 'cod_confirmed',
      action: 'confirmCod',
      by: 'staff',
      staffId: 's1',
      reason: null,
      restocked: false,
    },
  ],
  nextActions: [
    {
      to: 'shipped',
      action: 'ship',
      guards: ['hasShipment'],
      restock: false,
      blockedBy: 'Add the shipment (carrier and tracking number) first',
    },
    {
      to: 'cancelled',
      action: 'cancel',
      guards: ['moneyReturned'],
      restock: true,
      blockedBy: null,
    },
  ],
  customFields: {},
  pricesIncludeVat: true,
  currency: 'SAR',
};
const SETTINGS = [{ key: 'store.name', group: 'general', value: 'Supershop', editable: true }];

/**
 * The API is stateful here: a mutation changes what the next GET returns, like the real one — the
 * page refetches after every action, so a mock frozen in time would hide what staff actually see.
 */
function setup(
  ui,
  {
    permissions = ['order.view', 'order.update', 'order.cancel'],
    routes = () => ({}),
    path = '/orders',
    detail = DETAIL,
  } = {},
) {
  let current = structuredClone(detail);
  const update = (patch) => {
    current = { ...current, ...patch };
    return json(200, { data: current });
  };
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/orders': json(200, { data: [ROW], meta: { total: 1, page: 1, limit: 25 } }),
    'GET /api/v1/orders/o1': () => json(200, { data: current }),
    'GET /api/v1/settings': json(200, { data: SETTINGS }),
    'GET /api/v1/printing/status': json(200, { data: { enabled: false } }),
    ...routes(update),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/orders" element={ui} />
          <Route path="/orders/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.useRealTimers());

describe('the orders list', () => {
  it('shows an order with its state, payment and total', async () => {
    setup(<OrdersPage />);
    const row = (await screen.findByRole('link', { name: 'ORD-000007' })).closest('tr');
    expect(within(row).getByText('Being prepared')).toBeInTheDocument();
    expect(within(row).getByText('Not paid yet')).toBeInTheDocument();
    expect(within(row).getByText('SAR 253.00')).toBeInTheDocument();
    expect(within(row).getByText('Sara Ali')).toBeInTheDocument();
  });

  it('keeps the counter and the website apart, a tab each', async () => {
    const user = userEvent.setup();
    const m = setup(<OrdersPage />);
    await screen.findByRole('link', { name: 'ORD-000007' });

    // The till is what a shop looks at first, and the list is asked for just those sales.
    const posTab = screen.getByRole('tab', { name: 'Point of sale' });
    expect(posTab).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => {
      const last = m.calls.filter((c) => c.key === 'GET /api/v1/orders').at(-1);
      expect(last.url.searchParams.get('channel')).toBe('pos');
    });

    await user.click(screen.getByRole('tab', { name: 'Online store' }));
    await waitFor(() => {
      const last = m.calls.filter((c) => c.key === 'GET /api/v1/orders').at(-1);
      expect(last.url.searchParams.get('channel')).toBe('online');
    });
    expect(screen.getByRole('tab', { name: 'Online store' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('says which counter is empty, not just that something is', async () => {
    setup(<OrdersPage />, {
      path: '/orders?channel=online',
      routes: () => ({
        'GET /api/v1/orders': json(200, { data: [], meta: { total: 0, page: 1, limit: 25 } }),
      }),
    });
    expect(await screen.findByText('No online orders match this view.')).toBeInTheDocument();
  });

  it('asks the API for the filters the user picked', async () => {
    const user = userEvent.setup();
    const m = setup(<OrdersPage />);
    await screen.findByRole('link', { name: 'ORD-000007' });
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'shipped');
    await waitFor(() => {
      const last = m.calls.filter((c) => c.key === 'GET /api/v1/orders').at(-1);
      expect(last.url.searchParams.get('status')).toBe('shipped');
    });
  });
});

describe('one order', () => {
  it('offers only what the order says is possible, and explains a blocked action', async () => {
    setup(<OrderDetailPage />, { path: '/orders/o1' });
    expect(await screen.findByRole('heading', { name: /ORD-000007/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeDisabled();
    expect(screen.getByText(/Add the shipment/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeEnabled();
    // Not an action this order allows right now.
    expect(screen.queryByRole('button', { name: 'Mark as delivered' })).toBeNull();
  });

  it('records a shipment, which is what ships the order', async () => {
    const user = userEvent.setup();
    const m = setup(<OrderDetailPage />, {
      path: '/orders/o1',
      routes: (update) => ({
        'POST /api/v1/orders/o1/shipments': ({ init }) =>
          update({
            status: 'shipped',
            shipments: [
              {
                carrier: JSON.parse(init.body).carrier,
                trackingNumber: 'ARX-1',
                shippedAt: '2026-10-14T06:00:00.000Z',
              },
            ],
            nextActions: [],
          }),
      }),
    });
    await screen.findByRole('heading', { name: /ORD-000007/ });
    await user.type(screen.getByLabelText(/^Carrier/), 'Aramex');
    await user.type(screen.getByLabelText(/^Tracking number/), 'ARX-1');
    await user.click(screen.getByRole('button', { name: 'Record shipment' }));

    await waitFor(() => expect(m.count('POST /api/v1/orders/o1/shipments')).toBe(1));
    const body = JSON.parse(
      m.calls.filter((c) => c.key === 'POST /api/v1/orders/o1/shipments').at(-1).init.body,
    );
    expect(body).toEqual({ carrier: 'Aramex', trackingNumber: 'ARX-1' });
    expect(await screen.findByText('On its way')).toBeInTheDocument();
  });

  it('asks before cancelling and sends the reason with it', async () => {
    const user = userEvent.setup();
    const m = setup(<OrderDetailPage />, {
      path: '/orders/o1',
      routes: (update) => ({
        'POST /api/v1/orders/o1/transitions': () =>
          update({ status: 'cancelled', nextActions: [] }),
      }),
    });
    await screen.findByRole('heading', { name: /ORD-000007/ });
    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(screen.getByText('Cancel this order?')).toBeInTheDocument();
    expect(m.count('POST /api/v1/orders/o1/transitions')).toBe(0); // nothing yet

    await user.type(screen.getByLabelText(/Reason/), 'Customer changed mind');
    await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(m.count('POST /api/v1/orders/o1/transitions')).toBe(1));
    expect(
      JSON.parse(
        m.calls.filter((c) => c.key === 'POST /api/v1/orders/o1/transitions').at(-1).init.body,
      ),
    ).toEqual({ to: 'cancelled', reason: 'Customer changed mind' });
  });

  it('hides cancelling from staff who may not cancel', async () => {
    setup(<OrderDetailPage />, { path: '/orders/o1', permissions: ['order.view', 'order.update'] });
    await screen.findByRole('heading', { name: /ORD-000007/ });
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark as shipped' })).toBeInTheDocument();
  });

  it('keeps staff notes apart from the customer’s own note', async () => {
    const user = userEvent.setup();
    const m = setup(<OrderDetailPage />, {
      path: '/orders/o1',
      routes: (update) => ({
        'POST /api/v1/orders/o1/notes': ({ init }) =>
          update({
            notes: [
              {
                at: '2026-10-14T07:00:00.000Z',
                staffId: 's1',
                staffName: 'Root Admin',
                text: JSON.parse(init.body).text,
              },
            ],
          }),
      }),
    });
    await screen.findByRole('heading', { name: /ORD-000007/ });
    expect(screen.getByText(/From the customer/)).toBeInTheDocument();
    expect(screen.getByText(/Call on arrival/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Add note'), 'Customer asked to call first');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(m.count('POST /api/v1/orders/o1/notes')).toBe(1));
    expect(await screen.findByText('Customer asked to call first')).toBeInTheDocument();
    expect(screen.getByText(/Root Admin/)).toBeInTheDocument();
  });

  it('prints an invoice with the shop, the lines and the totals', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    setup(<OrderDetailPage />, { path: '/orders/o1' });
    await screen.findByRole('heading', { name: /ORD-000007/ });

    const invoice = within(screen.getByTestId('order-invoice'));
    expect(invoice.getByText('Supershop')).toBeInTheDocument();
    expect(invoice.getByText('Oxford Shirt')).toBeInTheDocument();
    expect(invoice.getByText('SAR 253.00')).toBeInTheDocument();
    expect(invoice.getByText(/Paid with Cash payment on delivery/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Print invoice' }));
    expect(print).toHaveBeenCalled();
  });

  it('renders the VAT number and ZATCA QR on the invoice when the shop has a VAT number', async () => {
    setup(<OrderDetailPage />, {
      path: '/orders/o1',
      detail: {
        ...DETAIL,
        shop: { name: 'Supershop', vatNumber: '300000000000003', address: 'Riyadh' },
      },
    });
    await screen.findByRole('heading', { name: /ORD-000007/ });
    const invoice = within(screen.getByTestId('order-invoice'));
    expect(invoice.getByText('300000000000003')).toBeInTheDocument();
    expect(invoice.getByTestId('zatca-qr').querySelector('svg')).not.toBeNull();
  });

  it('reprints the receipt directly from the orders list table', async () => {
    const user = userEvent.setup();
    const m = setup(<OrdersPage />);
    await screen.findByText('ORD-000007');

    const receiptButton = screen.getByRole('button', { name: /Receipt/i });
    expect(receiptButton).toBeInTheDocument();

    await user.click(receiptButton);
    await waitFor(() => expect(m.count('GET /api/v1/orders/o1')).toBe(1));
    expect(await screen.findByText(/Receipt · ORD-000007/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Print/i }).length).toBeGreaterThan(0);
  });

  it('allows reprinting the receipt from the order detail page', async () => {
    const user = userEvent.setup();
    setup(<OrderDetailPage />, { path: '/orders/o1' });
    await screen.findByRole('heading', { name: /ORD-000007/ });

    const reprintButton = screen.getByRole('button', { name: /Reprint Receipt/i });
    expect(reprintButton).toBeInTheDocument();

    await user.click(reprintButton);
    expect(await screen.findByText(/Receipt · ORD-000007/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Print/i }).length).toBeGreaterThan(0);
  });

  it('renders return and exchange buttons for the order and line items', async () => {
    setup(<OrderDetailPage />, {
      path: '/orders/o1',
      permissions: ['order.view', 'return.create'],
    });
    await screen.findByRole('heading', { name: /ORD-000007/ });

    const orderReturnLink = screen.getByRole('link', { name: /Return \/ Exchange/i });
    expect(orderReturnLink).toHaveAttribute('href', '/returns?order=ORD-000007');

    const itemReturnLink = screen.getByRole('link', { name: /^Return$/i });
    expect(itemReturnLink).toHaveAttribute(
      'href',
      '/returns?order=ORD-000007&mode=return&variantId=v1&qty=2',
    );

    const itemExchangeLink = screen.getByRole('link', { name: /^Exchange$/i });
    expect(itemExchangeLink).toHaveAttribute(
      'href',
      '/returns?order=ORD-000007&mode=exchange&variantId=v1&qty=2',
    );
  });
});
