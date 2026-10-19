import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { ShiftsPage } from '../pages/ShiftsPage';

const printRawMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/qz', () => ({
  printRaw: (...args) => printRawMock(...args),
}));

const BRANCH = { id: 'b1', code: 'MAIN', name: { en: 'Main Branch' } };

const makeSummary = ({
  openingCash = 20_000,
  cashSales = 5_750,
  cashIn = 0,
  cashOut = 0,
  closingCash = null,
} = {}) => {
  const expectedCash = openingCash + cashSales + cashIn - cashOut;
  const discrepancy = closingCash === null ? null : closingCash - expectedCash;
  return {
    openingCash,
    cashSales,
    cashIn,
    cashOut,
    netCashMovements: cashIn - cashOut,
    expectedCash,
    closingCash,
    discrepancy,
    sales: {
      count: 1,
      itemCount: 2,
      subtotal: 5_000,
      discountTotal: 0,
      net: 5_000,
      vat: 750,
      total: 5_750,
    },
    byMethod: [{ method: 'cash', netAmount: 5_750, count: 1 }],
  };
};

const OPEN_SHIFT = {
  id: 'sh1',
  shiftNo: 'SHF-00001',
  branchId: 'b1',
  openedBy: 'u1',
  openedAt: '2026-04-17T08:00:00.000Z',
  openingCash: 20_000,
  expectedCash: 25_750,
  closingCash: null,
  discrepancy: null,
  status: 'open',
  movements: [],
  summary: makeSummary(),
};

function setup({
  permissions = ['shift.view', 'shift.open', 'shift.close', 'shift.cashMovement'],
  currentShift = null,
  shiftsList = [],
  routes = {},
} = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'tok',
    profile: { name: 'Cashier' },
    access: { permissions },
  });

  let active = currentShift;
  let history = shiftsList;

  const m = mockFetch({
    'GET /api/v1/inventory/branches': json(200, { data: [BRANCH] }),
    'GET /api/v1/printing/status': json(200, {
      data: { enabled: true, autoPrintReceipt: false, configured: true },
    }),
    'GET /api/v1/shifts/current': () => json(200, { data: active }),
    'GET /api/v1/shifts': () =>
      json(200, {
        data: history,
        meta: { page: 1, limit: 20, total: history.length },
      }),
    'POST /api/v1/shifts/open': ({ init }) => {
      const body = JSON.parse(init.body);
      active = {
        ...OPEN_SHIFT,
        openingCash: body.openingCash,
        expectedCash: body.openingCash,
        summary: makeSummary({ openingCash: body.openingCash, cashSales: 0 }),
      };
      history = [active];
      return json(201, { data: active });
    },
    'POST /api/v1/shifts/sh1/movements': ({ init }) => {
      const body = JSON.parse(init.body);
      const cashIn = body.type === 'in' ? body.amount : 0;
      const cashOut = body.type === 'out' ? body.amount : 0;
      active = {
        ...active,
        movements: [
          ...active.movements,
          { ...body, createdAt: '2026-04-17T09:00:00.000Z', createdBy: 'u1' },
        ],
        summary: makeSummary({
          openingCash: active.openingCash,
          cashSales: 5_750,
          cashIn,
          cashOut,
        }),
        expectedCash: active.openingCash + 5_750 + cashIn - cashOut,
      };
      return json(201, { data: active });
    },
    'GET /api/v1/shifts/sh1/x-report': () =>
      json(200, {
        data: {
          shift: active ?? OPEN_SHIFT,
          report: { kind: 'x', number: 'SHF-00001' },
          lines: ['X-REPORT · MID-SHIFT', 'Shift: SHF-00001', 'Expected drawer: SAR 257.50'],
        },
      }),
    'POST /api/v1/shifts/sh1/print': () =>
      json(200, {
        data: { printer: 'EPSON-TM', data: 'X-REPORT RAW', width: 48 },
      }),
    'POST /api/v1/shifts/sh1/close': ({ init }) => {
      const body = JSON.parse(init.body);
      const summary = makeSummary({
        openingCash: active.openingCash,
        cashSales: 5_750,
        closingCash: body.closingCash,
      });
      const closedShift = {
        ...active,
        status: 'closed',
        closedAt: '2026-04-17T16:00:00.000Z',
        closingCash: body.closingCash,
        expectedCash: summary.expectedCash,
        discrepancy: summary.discrepancy,
        zReportNo: 'Z-00001',
        summary,
      };
      active = null;
      history = [closedShift];
      return json(200, {
        data: {
          shift: closedShift,
          zReport: { reportNo: 'Z-00001', shiftNo: 'SHF-00001', summary },
        },
      });
    },
    'GET /api/v1/shifts/sh1/z-report': () => {
      const closed = history[0] ?? { ...OPEN_SHIFT, status: 'closed', zReportNo: 'Z-00001' };
      return json(200, {
        data: {
          shift: closed,
          zReport: {
            reportNo: 'Z-00001',
            shiftNo: 'SHF-00001',
            summary: closed.summary ?? makeSummary({ closingCash: 25_500 }),
          },
          report: { kind: 'z', number: 'Z-00001' },
          lines: ['Z-REPORT · END OF SHIFT', 'Report: Z-00001', 'Discrepancy: SAR -2.50'],
        },
      });
    },
    ...routes,
  });

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/shifts']}>
        <ShiftsPage />
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

describe('P6.5 ShiftsPage', () => {
  it('opens a shift with an opening cash float', async () => {
    const user = userEvent.setup();
    const m = setup({ currentShift: null });

    await screen.findByText('No shift open');
    await user.click(screen.getByRole('button', { name: 'Open shift' }));

    const floatInput = await screen.findByLabelText('Opening cash float (SAR)');
    await user.type(floatInput, '250');
    await user.click(screen.getByRole('button', { name: 'Open shift' }));

    await waitFor(() => expect(screen.getByText(/Active shift · SHF-00001/)).toBeInTheDocument());
    const openCall = m.calls.find((c) => c.key === 'POST /api/v1/shifts/open');
    expect(JSON.parse(openCall.init.body)).toEqual({ branchId: 'b1', openingCash: 25_000 });
  });

  it('records a cash in/out movement and updates the expected drawer', async () => {
    const user = userEvent.setup();
    const m = setup({ currentShift: OPEN_SHIFT, shiftsList: [OPEN_SHIFT] });

    await screen.findByText(/Active shift · SHF-00001/);
    await user.click(screen.getByRole('button', { name: 'Cash in / out' }));

    await user.type(await screen.findByLabelText('Amount (SAR)'), '30');
    await user.type(screen.getByLabelText('Reason'), 'Change coins from safe');
    await user.click(screen.getByRole('button', { name: 'Record movement' }));

    await waitFor(() => expect(screen.getByText('Change coins from safe')).toBeInTheDocument());
    const moveCall = m.calls.find((c) => c.key === 'POST /api/v1/shifts/sh1/movements');
    expect(JSON.parse(moveCall.init.body)).toEqual({
      type: 'in',
      amount: 3_000,
      reason: 'Change coins from safe',
    });
  });

  it('views and prints the X-report via QZ Tray, then closes the shift and displays the Z-report', async () => {
    const user = userEvent.setup();
    setup({ currentShift: OPEN_SHIFT, shiftsList: [OPEN_SHIFT] });

    await screen.findByText(/Active shift · SHF-00001/);
    const xButtons = screen.getAllByRole('button', { name: 'X-report' });
    await user.click(xButtons[0]);

    await screen.findByText(/X-REPORT · MID-SHIFT/);
    await user.click(screen.getByRole('button', { name: 'Print on thermal printer' }));
    await waitFor(() => expect(printRawMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Close shift' }));
    const countedInput = await screen.findByLabelText('Counted cash in drawer (SAR)');
    await user.type(countedInput, '255');

    await user.click(screen.getByRole('button', { name: 'Close shift & issue Z-report' }));

    await screen.findByText(/Z-report · Z-00001/);
    expect(screen.getByText(/Z-REPORT · END OF SHIFT/)).toBeInTheDocument();
  });
});
