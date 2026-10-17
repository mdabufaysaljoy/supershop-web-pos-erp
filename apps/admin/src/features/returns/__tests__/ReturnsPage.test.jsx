import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { ReturnsPage } from '../pages/ReturnsPage';

const printRawMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/qz', () => ({
  printRaw: (...args) => printRawMock(...args),
}));

const BRANCH = { id: 'b1', code: 'MAIN', name: { en: 'Main Branch' } };

const SAMPLE_ORDER_LOOKUP = {
  order: {
    id: 'ord1',
    orderNo: 'POS-000001',
    channel: 'pos',
    status: 'completed',
    branchId: 'b1',
    placedAt: '2026-04-17T08:00:00.000Z',
    customer: { customerId: 'c1', name: 'Layla Customer', phone: '+966501112233' },
    totals: {
      itemCount: 2,
      subtotal: 23_000,
      discountTotal: 0,
      net: 20_000,
      vat: 3_000,
      total: 23_000,
    },
  },
  items: [
    {
      productId: 'p1',
      variantId: 'v-coffee',
      sku: 'COF-1',
      name: 'Coffee Beans',
      options: [],
      unitPrice: 11_500,
      qty: 2,
      returnedQty: 0,
      returnableQty: 2,
      discountTotal: 0,
      lineTotal: 23_000,
      net: 20_000,
      vat: 3_000,
    },
  ],
  returnable: true,
  priorReturns: [],
  methods: [
    { key: 'cash', label: 'Cash', type: 'cash' },
    { key: 'card', label: 'Card', type: 'offline' },
  ],
};

function setup({
  permissions = ['return.create', 'return.approve'],
  returnsList = [],
  routes = {},
} = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'tok',
    profile: { name: 'Cashier' },
    access: { permissions },
  });

  let history = returnsList;

  const m = mockFetch({
    'GET /api/v1/inventory/branches': json(200, { data: [BRANCH] }),
    'GET /api/v1/printing/status': json(200, {
      data: { enabled: true, autoPrintReceipt: false, configured: true },
    }),
    'GET /api/v1/returns': () =>
      json(200, {
        data: history,
        meta: { page: 1, limit: 15, total: history.length },
      }),
    'GET /api/v1/returns/lookup-order': () => json(200, { data: SAMPLE_ORDER_LOOKUP }),
    'GET /api/v1/pos/search': ({ url }) => {
      const q = new URL(url, 'http://localhost').searchParams.get('q') ?? '';
      if (q.toLowerCase().includes('filter')) {
        return json(200, {
          data: [{ variantId: 'v-filter', sku: 'FLT-1', name: 'Paper Filters', price: 5_750 }],
        });
      }
      return json(200, {
        data: [{ variantId: 'v-kettle', sku: 'KET-1', name: 'Pour-Over Kettle', price: 17_250 }],
      });
    },
    'POST /api/v1/returns': ({ init }) => {
      const body = JSON.parse(init.body);
      const isExc = body.type === 'exchange';
      const created = {
        id: isExc ? 'exc1' : 'ret1',
        returnNo: isExc ? 'EXC-000001' : 'RET-000001',
        type: body.type,
        orderId: 'ord1',
        orderNo: 'POS-000001',
        branchId: 'b1',
        returnLines: [
          {
            variantId: 'v-coffee',
            name: 'Coffee Beans',
            qty: 1,
            disposition: body.returnLines[0].disposition,
            lineTotal: 11_500,
          },
        ],
        returnTotals: {
          itemCount: 1,
          subtotal: 11_500,
          discountTotal: 0,
          net: 10_000,
          vat: 1_500,
          total: 11_500,
        },
        exchangeLines: isExc
          ? [{ variantId: 'v-kettle', name: 'Pour-Over Kettle', qty: 1, lineTotal: 17_250 }]
          : [],
        exchangeTotals: isExc
          ? {
              itemCount: 1,
              subtotal: 17_250,
              discountTotal: 0,
              net: 15_000,
              vat: 2_250,
              total: 17_250,
            }
          : null,
        refundMethod: isExc ? null : body.refundMethod,
        refundAmount: isExc ? 0 : 11_500,
        differenceDue: isExc ? 5_750 : 0,
        payments: body.payments ?? [],
        changeGiven: 0,
        createdAt: '2026-04-17T10:00:00.000Z',
        receiptLines: [
          isExc ? 'EXCHANGE RECEIPT' : 'RETURN / CREDIT NOTE',
          `Document: ${isExc ? 'EXC-000001' : 'RET-000001'}`,
        ],
      };
      history = [created, ...history];
      return json(201, { data: created });
    },
    'POST /api/v1/returns/ret1/print': () =>
      json(200, {
        data: { printer: 'EPSON-TM', data: 'RAW', widthMm: 80, lines: ['RETURN / CREDIT NOTE'] },
      }),
    ...routes,
  });

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/returns']}>
        <ReturnsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return m;
}

beforeEach(() => {
  localStorage.clear();
  printRawMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('P6.6 ReturnsPage', () => {
  it('looks up an order, processes a damaged return with refund method, and prints the credit note', async () => {
    const user = userEvent.setup();
    const m = setup();

    const orderInput = await screen.findByLabelText('Receipt / order number');
    await user.type(orderInput, 'POS-000001');
    await user.click(screen.getByRole('button', { name: 'Find order' }));

    await screen.findByText('Coffee Beans');

    const qtyInput = screen.getByLabelText('Return qty for Coffee Beans');
    await user.clear(qtyInput);
    await user.type(qtyInput, '1');

    const dispSelect = screen.getByLabelText('Disposition for Coffee Beans');
    await user.selectOptions(dispSelect, 'damaged');

    const methodSelect = screen.getByLabelText('Refund method');
    await user.selectOptions(methodSelect, 'store_credit');

    await user.click(screen.getByRole('button', { name: 'Complete return' }));

    await screen.findByText(/Return credit note · RET-000001/);
    const postCall = m.calls.find((c) => c.key === 'POST /api/v1/returns');
    expect(JSON.parse(postCall.init.body)).toMatchObject({
      type: 'return',
      orderId: 'ord1',
      refundMethod: 'store_credit',
      returnLines: [{ variantId: 'v-coffee', qty: 1, disposition: 'damaged' }],
    });

    await user.click(screen.getByRole('button', { name: 'Print receipt' }));
    await waitFor(() => expect(printRawMock).toHaveBeenCalledTimes(1));
  });

  it('enforces the exchange rule (new value >= returned credit) and completes a valid exchange with difference due', async () => {
    const user = userEvent.setup();
    const m = setup();

    const orderInput = await screen.findByLabelText('Receipt / order number');
    await user.type(orderInput, 'POS-000001');
    await user.click(screen.getByRole('button', { name: 'Find order' }));

    await screen.findByText('Coffee Beans');

    const qtyInput = screen.getByLabelText('Return qty for Coffee Beans');
    await user.clear(qtyInput);
    await user.type(qtyInput, '1');

    await user.click(screen.getByRole('button', { name: 'Exchange items' }));

    // Search a cheaper item (Paper Filters @ SAR 57.50 < SAR 115.00 return credit)
    const searchInput = screen.getByLabelText('Search replacement product');
    await user.type(searchInput, 'filter');
    const addButtons = await screen.findAllByRole('button', { name: 'Add' });
    await user.click(addButtons[0]);

    // Warning shown and Complete exchange button disabled
    await screen.findByText(/must be equal to or greater than the returned credit/i);
    const submitBtn = screen.getByRole('button', { name: 'Complete exchange' });
    expect(submitBtn).toBeDisabled();

    // Remove cheaper item and add Pour-Over Kettle (@ SAR 172.50 >= SAR 115.00)
    const filterQty = screen.getByLabelText('Replacement qty for Paper Filters');
    await user.clear(filterQty);
    await user.type(filterQty, '0');

    await user.type(searchInput, 'kettle');
    const addKettleBtns = await screen.findAllByRole('button', { name: 'Add' });
    await user.click(addKettleBtns[0]);

    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await screen.findByText(/Exchange receipt · EXC-000001/);
    const postCall = m.calls.find((c) => c.key === 'POST /api/v1/returns');
    expect(JSON.parse(postCall.init.body)).toMatchObject({
      type: 'exchange',
      orderId: 'ord1',
      returnLines: [{ variantId: 'v-coffee', qty: 1, disposition: 'restock' }],
      exchangeItems: [{ variantId: 'v-kettle', qty: 1 }],
      payments: [{ method: 'cash', amount: 5_750 }],
    });
  });
});
