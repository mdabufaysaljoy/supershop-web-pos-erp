import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { PosPage } from '../pages/PosPage';

const printRawMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/qz', () => ({
  printRaw: (...args) => printRawMock(...args),
}));

/** P6.2 — the till: scan, basket, money, change, held sales. */
const BRANCH = { id: 'b1', code: 'SHOP', name: { en: 'Shop' } };
const SHIRT = {
  variantId: 'v1',
  productId: 'p1',
  name: 'Oxford Shirt',
  options: [],
  sku: 'OX-RED',
  price: 11_500,
  image: null,
  onHand: 5,
};
/** The server's pricing of one shirt, as /pos/quote answers it. */
const quoteFor = (qty = 1, total = 11_500 * qty) => ({
  items: [{ variantId: 'v1', qty, unitPrice: 11_500, discountTotal: 0, lineTotal: total }],
  totals: { itemCount: qty, subtotal: total, discountTotal: 0, net: total, vat: 0, total },
  tender: { paid: 0, due: total, change: 0 },
  methods: [{ key: 'cash', type: 'cash', label: 'Cash' }],
});

const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);

function setup({ permissions = ['pos.sell', 'pos.discount'], routes = {} } = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/inventory/branches': json(200, { data: [BRANCH] }),
    'GET /api/v1/printing/status': json(200, {
      data: { enabled: false, autoPrintReceipt: true, configured: false },
    }),
    'GET /api/v1/pos/search': json(200, { data: [SHIRT] }),
    'GET /api/v1/payment-methods/public': json(200, {
      data: [{ key: 'cash', type: 'cash', label: 'Cash' }],
    }),
    'POST /api/v1/pos/quote': ({ init }) => {
      const body = JSON.parse(init.body);
      const qty = body.items.reduce((n, i) => n + i.qty, 0);
      const off = body.orderDiscount?.value ?? 0;
      return json(200, { data: quoteFor(qty, 11_500 * qty - off) });
    },
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

/** Scans nothing: types a name and takes the top match, as a cashier without a scanner would. */
const addShirt = async (user) => {
  await user.type(await screen.findByLabelText('Scan or search'), 'oxford');
  await user.click(await screen.findByRole('button', { name: /Oxford Shirt/ }));
};

/** The money side of the screen, where only the server's own figures are shown. */
const till = () => within(screen.getByRole('complementary'));
/** Waits for the figure the SERVER priced (the basket shows the catalogue price until then). */
const toPay = (amount) =>
  waitFor(() => expect(till().getByLabelText('To pay')).toHaveTextContent(amount));

/** jsdom's `navigator.onLine` is a getter on the prototype; this replaces it for one test. */
const setOnline = (value) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
const goOffline = () => setOnline(false);

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  // Every till starts connected, whatever the test before it did. The query client keeps its own
  // idea of this (it pauses requests while it believes the browser is offline), so both are reset.
  setOnline(true);
  onlineManager.setOnline(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('the basket', () => {
  it('adds what the cashier picked and shows the server’s total', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);

    expect(screen.getByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
    await toPay('SAR 115.00');
  });

  it('asks the server again when a quantity changes, and never adds up money itself', async () => {
    const user = userEvent.setup();
    const m = setup();
    await addShirt(user);
    await waitFor(() => expect(m.count('POST /api/v1/pos/quote')).toBeGreaterThan(0));

    await user.clear(screen.getByLabelText('Quantity of Oxford Shirt'));
    await user.type(screen.getByLabelText('Quantity of Oxford Shirt'), '3');
    await waitFor(() => expect(bodyOf(m, 'POST /api/v1/pos/quote').items[0].qty).toBe(3));
    await toPay('SAR 345.00');
  });

  it('sends a discount for the server to price, not a total the till worked out', async () => {
    const user = userEvent.setup();
    const m = setup();
    await addShirt(user);
    await user.type(screen.getByLabelText('Off the whole basket'), '15');

    await waitFor(() =>
      expect(bodyOf(m, 'POST /api/v1/pos/quote').orderDiscount).toEqual({
        type: 'amount',
        value: 1500,
      }),
    );
    await toPay('SAR 100.00');
  });

  it('hides discounts from a cashier who may not give them', async () => {
    const user = userEvent.setup();
    setup({ permissions: ['pos.sell'] });
    await addShirt(user);
    expect(screen.queryByLabelText('Off the whole basket')).toBeNull();
    expect(screen.queryByLabelText('Discount on Oxford Shirt')).toBeNull();
  });
});

describe('taking the money', () => {
  it('fills in the exact amount, then rings the sale up with one key', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'POST /api/v1/pos/sales': json(201, {
          data: {
            orderNo: 'POS-000001',
            totals: { total: 11_500 },
            changeGiven: 0,
            payments: [{ method: 'cash', amount: 11_500 }],
          },
        }),
      },
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));

    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    const call = m.calls.filter((c) => c.key === 'POST /api/v1/pos/sales').at(-1);
    expect(JSON.parse(call.init.body)).toMatchObject({
      branchId: 'b1',
      items: [{ variantId: 'v1', qty: 1 }],
      payments: [{ method: 'cash', amount: 11_500 }],
      customer: { mode: 'walkin' },
    });
    expect(call.init.headers['Idempotency-Key']).toMatch(/[\w-]{8,}/);
    expect(await screen.findByText(/POS-000001/)).toBeInTheDocument();
    expect(screen.getByText('Nothing in the basket yet. Scan something.')).toBeInTheDocument();
  });

  it('allows walk-in customer to tender with an MFS payment method and transaction reference', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'GET /api/v1/payment-methods/public': json(200, {
          data: [
            { key: 'cash', type: 'cash', label: 'Cash' },
            { key: 'bkash', type: 'mfs', label: 'bKash' },
          ],
        }),
        'POST /api/v1/pos/quote': () =>
          json(200, {
            data: {
              ...quoteFor(1, 11_500),
              methods: [
                { key: 'cash', type: 'cash', label: 'Cash' },
                { key: 'bkash', type: 'mfs', label: 'bKash' },
              ],
            },
          }),
        'POST /api/v1/pos/sales': json(201, {
          data: {
            orderNo: 'POS-000002',
            totals: { total: 11_500 },
            changeGiven: 0,
            payments: [{ method: 'bkash', amount: 11_500, reference: 'TRX-12345' }],
          },
        }),
      },
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    // Click the MFS button (+ bKash)
    await user.click(await screen.findByRole('button', { name: /bKash/i }));
    // Tender list now has bKash
    expect(screen.getAllByText('bKash').length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Complete sale' }));
    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    const call = m.calls.filter((c) => c.key === 'POST /api/v1/pos/sales').at(-1);
    expect(JSON.parse(call.init.body)).toMatchObject({
      payments: [{ method: 'bkash', amount: 11_500 }],
      customer: { mode: 'walkin' },
    });
  });

  it('will not complete a sale that is not covered', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');

    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(till().getByLabelText('Still to pay')).toHaveTextContent('SAR 65.00');
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
  });

  it('shows the change to hand back before anything is rung up', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.type(screen.getByLabelText('Amount'), '200');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(till().getByLabelText('Change')).toHaveTextContent('SAR 85.00');
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeEnabled();
  });

  it('attaches a customer when the cashier asks for one', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'POST /api/v1/pos/sales': json(201, {
          data: { orderNo: 'POS-000002', totals: { total: 11_500 }, changeGiven: 0, payments: [] },
        }),
      },
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.click(screen.getByRole('button', { name: 'Add a customer' }));
    await user.type(screen.getByLabelText('Name'), 'Nora Said');
    await user.type(screen.getByLabelText('Phone'), '0599999999');
    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));

    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/pos/sales').customer).toEqual({
      mode: 'contact',
      name: 'Nora Said',
      phone: '0599999999',
    });
  });
});

describe('holding a sale', () => {
  it('puts the basket aside and brings it back', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.click(screen.getByRole('button', { name: 'Hold this sale' }));
    expect(screen.getByText('Nothing in the basket yet. Scan something.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
  });
});

describe('when the connection drops', () => {
  it('keeps the basket, says so, and refuses to guess at a sale', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');

    goOffline();
    onlineManager.setOnline(false);
    window.dispatchEvent(new Event('offline'));

    expect(await screen.findByText(/No connection/)).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hold this sale' })).toBeEnabled();
  });
});

/** P6.3 — the receipt prints itself, and can be asked for again. */
describe('printing the receipt', () => {
  const SOLD = {
    id: 'o1',
    orderNo: 'POS-000001',
    totals: { total: 11_500 },
    changeGiven: 0,
    payments: [{ method: 'cash', amount: 11_500 }],
  };
  const printingOn = {
    'GET /api/v1/printing/status': json(200, {
      data: { enabled: true, autoPrintReceipt: true, configured: true },
    }),
    'POST /api/v1/pos/sales': json(201, { data: SOLD }),
    'GET /api/v1/printing/receipt/o1': json(200, {
      data: { printer: 'EPSON TM-T20', profileId: 'pr1', widthMm: 80, data: 'G0A=' },
    }),
  };

  const sell = async (user) => {
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));
  };

  it('fetches the receipt by itself when the shop prints', async () => {
    const user = userEvent.setup();
    const m = setup({ routes: printingOn });
    await sell(user);
    await waitFor(() => expect(m.count('GET /api/v1/printing/receipt/o1')).toBe(1));
  });

  it('prints nothing when the shop has not set printing up', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        ...printingOn,
        'GET /api/v1/printing/status': json(200, {
          data: { enabled: false, autoPrintReceipt: true, configured: false },
        }),
      },
    });
    await sell(user);
    await screen.findByText(/POS-000001/);
    expect(m.count('GET /api/v1/printing/receipt/o1')).toBe(0);
    expect(screen.queryByRole('button', { name: 'Print the receipt again' })).toBeNull();
  });

  it('offers the receipt again, and says so when the printer cannot be reached', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        ...printingOn,
        'GET /api/v1/printing/receipt/o1': json(503, {
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Printing is not set up' },
        }),
      },
    });
    await sell(user);
    await screen.findByText(/POS-000001/);
    expect(await screen.findByText(/could not be printed/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Print the receipt again' }));
    await waitFor(() => expect(m.count('GET /api/v1/printing/receipt/o1')).toBe(2));
  });

  it('opens printable receipt dialog when View Receipt button is clicked', async () => {
    const user = userEvent.setup();
    setup({ routes: printingOn });
    await sell(user);
    await screen.findByText(/POS-000001/);

    const viewBtn = screen.getByRole('button', { name: 'View Receipt' });
    expect(viewBtn).toBeInTheDocument();
    await user.click(viewBtn);

    expect(screen.getByText('Served by:')).toBeInTheDocument();
    expect(screen.getByText('Thank you for your purchase!')).toBeInTheDocument();
  });
});

describe('catalogue and filtering', () => {
  it('displays products in catalogue grid and filters by brand', async () => {
    const user = userEvent.setup();
    const BRAND = { id: 'br1', name: { en: 'Nike' } };
    const NIKE_SHOE = {
      variantId: 'v2',
      productId: 'p2',
      name: 'Nike Runner',
      options: [],
      sku: 'NK-RUN',
      price: 25_000,
      image: null,
      onHand: 10,
    };
    setup({
      routes: {
        'GET /api/v1/brands': json(200, { data: [BRAND] }),
        'GET /api/v1/pos/search': ({ url }) => {
          if (url.searchParams.get('brandId') === 'br1') {
            return json(200, { data: [NIKE_SHOE] });
          }
          return json(200, { data: [SHIRT] });
        },
      },
    });

    expect(await screen.findByRole('button', { name: /Oxford Shirt/ })).toBeInTheDocument();

    const brandSelect = await screen.findByRole('combobox', { name: /All brands/i });
    await user.selectOptions(brandSelect, 'br1');

    expect(await screen.findByRole('button', { name: /Nike Runner/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Oxford Shirt/ })).toBeNull();
  });

  it('renders open shift button when shift is not open', async () => {
    setup({
      routes: {
        'GET /api/v1/shifts/current': json(200, { data: null }),
      },
      permissions: ['pos.sell', 'shift.open', 'shift.view'],
    });

    expect(await screen.findByRole('button', { name: /Open shift/i })).toBeInTheDocument();
  });

  it('does not display shift bar when shift is already open', async () => {
    setup({
      routes: {
        'GET /api/v1/shifts/current': json(200, {
          data: { id: 's1', shiftNo: 'SHF-000001', status: 'open' },
        }),
      },
      permissions: ['pos.sell', 'shift.open', 'shift.view'],
    });

    await screen.findByRole('button', { name: /Oxford Shirt/ });
    expect(screen.queryByRole('button', { name: /Open shift/i })).toBeNull();
    expect(screen.queryByText(/SHF-000001/)).toBeNull();
  });
});
