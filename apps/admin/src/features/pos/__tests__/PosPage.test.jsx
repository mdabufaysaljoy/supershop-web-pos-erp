import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    profile: { id: 'staff-1', name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/inventory/branches': json(200, { data: [BRANCH] }),
    'GET /api/v1/printing/status': json(200, {
      data: { enabled: false, autoPrintReceipt: true, configured: false },
    }),
    'GET /api/v1/pos/search': json(200, { data: [SHIRT] }),
    'GET /api/v1/customers': json(200, {
      data: [
        {
          id: 'c1',
          name: 'Nora Said',
          phone: '+966599999999',
          email: 'nora@example.test',
          segment: 'new',
        },
      ],
      meta: { total: 1 },
    }),
    'GET /api/v1/loyalty/lookup': json(404, {
      error: { code: 'NOT_FOUND', message: 'No membership' },
    }),
    'GET /api/v1/payment-methods/public': json(200, {
      data: [{ key: 'cash', type: 'cash', label: 'Cash' }],
    }),
    'GET /api/v1/settings/public': json(200, {
      data: { 'customers.allowInternationalPhone': false },
    }),
    'POST /api/v1/pos/quote': ({ init }) => {
      const body = JSON.parse(init.body);
      const qty = body.items.reduce((n, i) => n + i.qty, 0);
      const off = body.orderDiscount?.value ?? 0;
      return json(200, { data: quoteFor(qty, 11_500 * qty - off) });
    },
    ...routes,
  });
  const tree = (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/pos']}>
        <PosPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  // As the app runs it: <StrictMode> double-invokes renders and state updaters, and a basket that
  // only counts right outside it is a basket that overcharges the customer.
  const view = render(<StrictMode>{tree}</StrictMode>);
  return Object.assign(m, { view });
}

/** What a reload (or a sign-out and back in) does: the page is mounted again from scratch. */
const reopenTill = (m) => {
  m.view.unmount();
  render(
    <StrictMode>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/pos']}>
          <PosPage />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
};

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

  it('refuses a phone the sale would refuse, on the field, before the sale is rung up', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.click(screen.getByRole('button', { name: 'Add a customer' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('Name'), 'Abu Faysal');
    await user.type(dialog.getByLabelText('Phone'), '+8801741918615');

    // The shop takes Saudi mobiles only, so the till says so HERE — not through a sale that fails.
    expect(dialog.getByRole('alert')).toHaveTextContent('Saudi mobile');
    expect(dialog.getByRole('button', { name: /Attach to Sale/ })).toBeDisabled();
  });

  it('takes an overseas number once the shop allows one', async () => {
    const user = userEvent.setup();
    setup({
      routes: {
        'GET /api/v1/settings/public': json(200, {
          data: { 'customers.allowInternationalPhone': true },
        }),
      },
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.click(screen.getByRole('button', { name: 'Add a customer' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('Phone'), '+8801741918615');
    await waitFor(() => expect(dialog.queryByRole('alert')).toBeNull());
    expect(dialog.getByRole('button', { name: /Attach to Sale/ })).toBeEnabled();
  });
});

/** Attaches a customer the way the modal does: search, then pick one the shop already has. */
const attachCustomer = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Add a customer' }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.type(dialog.getByLabelText(/Find Existing Customer/), 'Nora');
  await user.click(await dialog.findByRole('button', { name: /Nora Said/ }));
};

describe('holding a sale', () => {
  it('puts the basket aside with its customer, and brings both back', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');
    await attachCustomer(user);
    expect(till().getByText('Nora Said')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hold this sale' }));
    expect(screen.getByText('Nothing in the basket yet. Scan something.')).toBeInTheDocument();
    expect(till().queryByText('Nora Said')).toBeNull();

    // The queue lives behind one button beside the payment heading.
    await user.click(screen.getByRole('button', { name: /Held/ }));
    const queue = within(await screen.findByRole('dialog'));
    expect(queue.getByText('Nora Said')).toBeInTheDocument();
    expect(queue.getByText(/1 item/)).toBeInTheDocument();

    await user.click(queue.getByRole('button', { name: 'Resume' }));
    expect(screen.getByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
    expect(till().getByText('Nora Said')).toBeInTheDocument();
  });

  it('serves the queue oldest first and never drops what is on screen', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: 'Hold this sale' }));

    // A second sale is started and held too.
    await addShirt(user);
    await user.clear(screen.getByLabelText('Quantity of Oxford Shirt'));
    await user.type(screen.getByLabelText('Quantity of Oxford Shirt'), '2');
    await user.click(screen.getByRole('button', { name: 'Hold this sale' }));

    await user.click(screen.getByRole('button', { name: /Held/ }));
    const queue = within(await screen.findByRole('dialog'));
    const rows = queue.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // The first one held is the first in the queue.
    expect(within(rows[0]).getByText(/1 item/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/2 items/)).toBeInTheDocument();
  });

  it('forgets a held sale the cashier removes', async () => {
    const user = userEvent.setup();
    setup();
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: 'Hold this sale' }));

    await user.click(screen.getByRole('button', { name: /Held/ }));
    const queue = within(await screen.findByRole('dialog'));
    await user.click(queue.getByRole('button', { name: /Remove the held sale/ }));
    expect(queue.getByText('No sales are being held.')).toBeInTheDocument();
  });
});

describe('what the till remembers', () => {
  it('still has the basket after the page is reloaded', async () => {
    const user = userEvent.setup();
    const m = setup();
    await addShirt(user);
    await toPay('SAR 115.00');

    reopenTill(m);
    expect(await screen.findByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
    await toPay('SAR 115.00');
  });

  it('brings the customer back with it', async () => {
    const user = userEvent.setup();
    const m = setup();
    await addShirt(user);
    await toPay('SAR 115.00');
    await attachCustomer(user);

    reopenTill(m);
    expect(await screen.findByText('Nora Said')).toBeInTheDocument();
  });

  it('keeps held sales for the cashier who held them, not for the terminal', async () => {
    const user = userEvent.setup();
    const m = setup();
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: 'Hold this sale' }));

    // Another cashier signs in on the same till.
    useAuthStore.setState({ profile: { id: 'staff-2', name: 'B' } });
    reopenTill(m);
    await screen.findByLabelText('Scan or search');
    expect(screen.queryByRole('button', { name: /Held/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Held/ }));
    expect(
      within(await screen.findByRole('dialog')).getByText('No sales are being held.'),
    ).toBeInTheDocument();
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

  it('never opens the browser print dialog — a thermal slip takes raw bytes', async () => {
    const user = userEvent.setup();
    const browserPrint = vi.fn();
    vi.spyOn(window, 'print').mockImplementation(browserPrint);
    const m = setup({ routes: printingOn });
    await sell(user);
    await waitFor(() => expect(m.count('GET /api/v1/printing/receipt/o1')).toBe(1));
    await user.click((await screen.findAllByRole('button', { name: /Print/ }))[0]);
    await waitFor(() => expect(m.count('GET /api/v1/printing/receipt/o1')).toBe(2));
    expect(browserPrint).not.toHaveBeenCalled();
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

  it('paginates products with 50 items per page and supports next/previous controls', async () => {
    const user = userEvent.setup();
    const sixtyItems = Array.from({ length: 60 }, (_, i) => ({
      variantId: `v-${i + 1}`,
      productId: `p-${i + 1}`,
      name: `Product Item ${i + 1}`,
      options: [],
      sku: `SKU-${i + 1}`,
      price: 1000 + i * 10,
      image: null,
      onHand: 10,
    }));

    setup({
      routes: {
        'GET /api/v1/pos/search': json(200, { data: sixtyItems }),
      },
    });

    expect(await screen.findByRole('button', { name: /Product Item 1\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Product Item 50\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Product Item 51\b/ })).toBeNull();
    expect(screen.getByText('1-50 of 60')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // Click Next page
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByRole('button', { name: /Product Item 51\b/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Product Item 60\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Product Item 1\b/ })).toBeNull();
    expect(screen.getByText('51-60 of 60')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('searches and suggests existing customer in customer modal', async () => {
    const user = userEvent.setup();
    const existingCust = {
      id: 'c-101',
      name: 'Zaid Salem',
      phone: '0511111111',
      loyaltyTier: 'gold',
      loyaltyPoints: 350,
      orderCount: 12,
    };

    setup({
      routes: {
        'GET /api/v1/customers': json(200, { data: [existingCust] }),
      },
    });

    await screen.findByRole('button', { name: /Oxford Shirt/ });
    await user.click(screen.getByRole('button', { name: 'Add a customer' }));

    // Customer modal opens
    const searchInput = screen.getByPlaceholderText('Search by phone number or name...');
    expect(searchInput).toBeInTheDocument();
    await user.type(searchInput, '0511111111');

    // Suggestions list shows matching customer
    const custSuggestion = await screen.findByRole('button', { name: /Zaid Salem/ });
    expect(custSuggestion).toBeInTheDocument();
    expect(screen.getByText('0511111111')).toBeInTheDocument();

    // Click customer suggestion to attach
    await user.click(custSuggestion);
    expect(screen.getByText('Zaid Salem')).toBeInTheDocument();
  });

  it('automatically attaches customer when loyalty card barcode is scanned or submitted in search', async () => {
    const user = userEvent.setup();
    const loyaltyCustomer = {
      customer: {
        id: 'c-loy-1',
        name: 'Noura Al-Saud',
        phone: '0555555555',
      },
      pointsBalance: 250,
      tier: 'gold',
      cardNumber: 'LC88990011',
    };

    setup({
      routes: {
        'GET /api/v1/loyalty/lookup': json(200, { data: loyaltyCustomer }),
      },
    });

    await screen.findByRole('button', { name: /Oxford Shirt/ });
    expect(screen.getByRole('button', { name: 'Add a customer' })).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Scan or search');
    await user.type(searchInput, 'LC88990011{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Noura Al-Saud')).toBeInTheDocument();
      expect(screen.getByText(/250 pts/)).toBeInTheDocument();
    });
  });

  it('holds a percentage at the most the shop allows, instead of being refused', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        // This shop lets a cashier take 20% off, and no more.
        'GET /api/v1/settings/public': json(200, { data: { 'pos.maxDiscountBps': 2000 } }),
        'POST /api/v1/pos/quote': ({ init }) => {
          const body = JSON.parse(init.body);
          const bps = body.orderDiscount?.value ?? 0;
          // The API refuses anything over the cap, which is what left the till showing stale
          // totals and a "prices could not be checked" banner.
          if (bps > 2000) {
            return json(400, {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'That discount is too large',
                details: [{ path: 'orderDiscount.value', message: 'validation.tooLong' }],
              },
            });
          }
          const qty = body.items.reduce((n, i) => n + i.qty, 0);
          const gross = 11_500 * qty;
          return json(200, { data: quoteFor(qty, gross - Math.round((gross * bps) / 10_000)) });
        },
      },
      permissions: ['pos.sell', 'pos.discount'],
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.selectOptions(screen.getByLabelText('Discount type'), 'percent');
    await user.type(screen.getByLabelText('Off the whole basket'), '50');

    // Held at 20%: the basket drops to 92.00 and the till says why, rather than going stale.
    await toPay('SAR 92.00');
    expect(screen.getByText('20% is the most this shop allows off a basket.')).toBeInTheDocument();
    const sent = JSON.parse(
      m.calls.filter((c) => c.key === 'POST /api/v1/pos/quote').at(-1).init.body,
    );
    expect(sent.orderDiscount).toEqual({ type: 'percent', value: 2000 });
    expect(screen.queryByText(/could not be checked/)).toBeNull();
  });

  it('completes a basket discounted to nothing, which needs no tender', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'GET /api/v1/settings/public': json(200, { data: { 'pos.maxDiscountBps': 10_000 } }),
        'POST /api/v1/pos/quote': ({ init }) => {
          const body = JSON.parse(init.body);
          const qty = body.items.reduce((n, i) => n + i.qty, 0);
          const gross = 11_500 * qty;
          const off = Math.round((gross * (body.orderDiscount?.value ?? 0)) / 10_000);
          return json(200, { data: quoteFor(qty, gross - off) });
        },
        'POST /api/v1/pos/sales': json(201, {
          data: { id: 'o-free', orderNo: 'POS-000100', totals: { total: 0 }, payments: [] },
        }),
      },
      permissions: ['pos.sell', 'pos.discount'],
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.selectOptions(screen.getByLabelText('Discount type'), 'percent');
    await user.type(screen.getByLabelText('Off the whole basket'), '100');
    await toPay('SAR 0.00');

    // Nothing to tender, and nothing stopping the sale.
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));
    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    expect(
      JSON.parse(m.calls.filter((c) => c.key === 'POST /api/v1/pos/sales').at(-1).init.body)
        .payments,
    ).toEqual([]);
  });

  it('takes a percentage off the basket as a percentage, not as money', async () => {
    const user = userEvent.setup();
    const m = setup({
      routes: {
        'POST /api/v1/pos/quote': ({ init }) => {
          const body = JSON.parse(init.body);
          const qty = body.items.reduce((n, i) => n + i.qty, 0);
          const gross = 11_500 * qty;
          const off =
            body.orderDiscount?.type === 'percent'
              ? Math.round((gross * body.orderDiscount.value) / 10_000)
              : (body.orderDiscount?.value ?? 0);
          return json(200, { data: quoteFor(qty, gross - off) });
        },
      },
      permissions: ['pos.sell', 'pos.discount'],
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.selectOptions(screen.getByLabelText('Discount type'), 'percent');
    await user.type(screen.getByLabelText('Off the whole basket'), '10');

    // 10% off 115.00 is 11.50 — not 10 halalas, which is what "percent" used to send.
    await toPay('SAR 103.50');
    const sent = JSON.parse(
      m.calls.filter((c) => c.key === 'POST /api/v1/pos/quote').at(-1).init.body,
    );
    expect(sent.orderDiscount).toEqual({ type: 'percent', value: 1000 });
  });

  it('attaches a scanned member with nothing open and nothing clicked, and offers their points', async () => {
    const loyal = {
      customer: { id: 'c-loy-2', name: 'Noura Al-Saud', phone: '0555555555' },
      pointsBalance: 250,
      tier: 'gold',
      cardNumber: 'LC88990011',
    };
    setup({ routes: { 'GET /api/v1/loyalty/lookup': json(200, { data: loyal }) } });
    await screen.findByRole('button', { name: /Oxford Shirt/ });

    // A hardware scan while the cashier is looking at the products: no modal, no click.
    for (const ch of 'LC88990011') fireEvent.keyDown(document.body, { key: ch });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(await screen.findByText('Noura Al-Saud')).toBeInTheDocument();
    // And their points are offered on the spot, to spend as much of as they like.
    expect(await screen.findByLabelText('Spend points')).toBeInTheDocument();
    expect(screen.getByText('250 points available')).toBeInTheDocument();
  });

  it('spends the points the cashier asks for, and sends them with the sale', async () => {
    const user = userEvent.setup();
    const loyal = {
      customer: { id: 'c-loy-3', name: 'Noura Al-Saud', phone: '0555555555' },
      pointsBalance: 250,
      tier: 'gold',
      cardNumber: 'LC88990012',
    };
    const m = setup({
      routes: {
        'GET /api/v1/loyalty/lookup': json(200, { data: loyal }),
        'POST /api/v1/pos/quote': ({ init }) => {
          const body = JSON.parse(init.body);
          const points = body.redeemPoints ?? 0;
          const qty = body.items.reduce((n, i) => n + i.qty, 0);
          const total = 11_500 * qty - points * 100;
          return json(200, {
            data: {
              ...quoteFor(qty, total),
              ...(points ? { redemption: { points, value: points * 100 } } : {}),
            },
          });
        },
      },
    });
    await addShirt(user);
    await toPay('SAR 115.00');

    for (const ch of 'LC88990012') fireEvent.keyDown(document.body, { key: ch });
    fireEvent.keyDown(document.body, { key: 'Enter' });

    const points = await screen.findByLabelText('Spend points');
    await user.type(points, '25');
    // The server prices the points: the basket drops by 25.00 and the box says so.
    await toPay('SAR 90.00');
    expect(await screen.findByText('−SAR 25.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));
    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    expect(
      JSON.parse(m.calls.filter((c) => c.key === 'POST /api/v1/pos/sales').at(-1).init.body)
        .redeemPoints,
    ).toBe(25);
  });

  it('opens recent sales modal and allows reprinting receipt for any previous sale', async () => {
    const user = userEvent.setup();
    const pastSale = {
      id: 'sale-past-1',
      orderNo: 'POS-000099',
      status: 'completed',
      channel: 'pos',
      placedAt: '2026-10-18T10:00:00.000Z',
      customer: { name: 'Fahad', phone: '0599999999' },
      itemCount: 1,
      total: 11500,
      currency: 'SAR',
      payment: { method: 'cash', status: 'paid' },
    };
    const fullPastSale = {
      ...pastSale,
      items: [
        {
          sku: 'OX-RED',
          name: 'Oxford Shirt',
          qty: 1,
          unitPrice: 11500,
          lineTotal: 11500,
        },
      ],
      totals: {
        itemCount: 1,
        subtotal: 11500,
        vat: 1500,
        total: 11500,
      },
      payments: [{ method: 'cash', label: 'Cash', amount: 11500 }],
      changeGiven: 0,
      shop: { name: 'Shop', vatNumber: '300000000000003' },
    };

    const m = setup({
      routes: {
        'GET /api/v1/orders': json(200, { data: [pastSale], meta: { total: 1 } }),
        'GET /api/v1/orders/sale-past-1': json(200, { data: fullPastSale }),
      },
    });

    await screen.findByRole('button', { name: /Oxford Shirt/ });
    const recentSalesBtn = screen.getByRole('button', { name: /Recent Sales & Receipts/i });
    expect(recentSalesBtn).toBeInTheDocument();

    await user.click(recentSalesBtn);

    // Modal displays previous sale
    expect(await screen.findByText('POS-000099')).toBeInTheDocument();
    expect(screen.getByText('Fahad')).toBeInTheDocument();

    const reprintBtn = screen.getByRole('button', { name: /Reprint/i });
    await user.click(reprintBtn);

    // Thermal receipt dialog opens
    await waitFor(() => expect(m.count('GET /api/v1/orders/sale-past-1')).toBe(1));
    expect(await screen.findByText(/Receipt · POS-000099/)).toBeInTheDocument();
  });
});

describe('selling to a customer', () => {
  const sold = {
    'POST /api/v1/pos/sales': json(201, {
      data: {
        id: 'o1',
        orderNo: 'POS-000001',
        totals: { total: 11_500 },
        changeGiven: 0,
        payments: [{ method: 'cash', amount: 11_500 }],
        customer: { name: 'Nora Said' },
      },
    }),
  };

  it('sends only what the sale endpoint takes — no loyalty extras, no empty fields', async () => {
    const user = userEvent.setup();
    const m = setup({ routes: sold });
    await addShirt(user);
    await toPay('SAR 115.00');
    await attachCustomer(user);

    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));

    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    const body = bodyOf(m, 'POST /api/v1/pos/sales');
    expect(body.customer).toEqual({
      mode: 'contact',
      customerId: 'c1',
      name: 'Nora Said',
      phone: '+966599999999',
      email: 'nora@example.test',
    });
    // The screen's own notes about a customer never travel.
    expect(body.customer.loyalty).toBeUndefined();
    expect(body.customer.id).toBeUndefined();
  });

  it('sells to a walk-in with nothing attached', async () => {
    const user = userEvent.setup();
    const m = setup({ routes: sold });
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));

    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/pos/sales').customer).toEqual({ mode: 'walkin' });
  });

  it('starts a clean basket after a sale, and remembers nothing of it', async () => {
    const user = userEvent.setup();
    const m = setup({ routes: sold });
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: /Exact amount/ }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));
    await screen.findByText(/POS-000001/);

    reopenTill(m);
    expect(
      await screen.findByText('Nothing in the basket yet. Scan something.'),
    ).toBeInTheDocument();
  });
});

describe('splitting the money', () => {
  /** Two methods, as a shop with a card terminal would have. */
  const twoMethods = {
    'GET /api/v1/payment-methods/public': json(200, {
      data: [
        { key: 'cash', type: 'cash', label: 'Cash' },
        { key: 'card', type: 'offline', label: 'Card terminal' },
      ],
    }),
    'POST /api/v1/pos/quote': ({ init }) => {
      const body = JSON.parse(init.body);
      const qty = body.items.reduce((n, i) => n + i.qty, 0);
      const total = 11_500 * qty;
      return json(200, {
        data: {
          ...quoteFor(qty, total),
          methods: [
            { key: 'cash', type: 'cash', label: 'Cash' },
            { key: 'card', type: 'offline', label: 'Card terminal' },
          ],
        },
      });
    },
  };

  it('settles what is left with one tap, method by method', async () => {
    const user = userEvent.setup();
    setup({ routes: twoMethods });
    await addShirt(user);
    await toPay('SAR 115.00');

    // Half on the card terminal…
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.selectOptions(screen.getByLabelText('Paying with'), 'card');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(till().getByLabelText('Still to pay')).toHaveTextContent('SAR 65.00');

    // …and the rest in cash, with one tap.
    await user.click(screen.getByRole('button', { name: 'Settle what is due with Cash' }));
    expect(till().getByLabelText('Change')).toHaveTextContent('SAR 0.00');
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeEnabled();
  });

  it('says so when change is owed and there is no cash to give it from', async () => {
    const user = userEvent.setup();
    setup({ routes: twoMethods });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.selectOptions(screen.getByLabelText('Paying with'), 'card');
    await user.type(screen.getByLabelText('Amount'), '200');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // The amount is taken as entered — 200 really was charged — but 85 cannot come back out of
    // a drawer nothing was paid into, and the API refuses the sale for the same reason.
    expect(till().getByLabelText('Tendered')).toHaveTextContent('SAR 200.00');
    expect(till().getByLabelText('Change')).toHaveTextContent('SAR 85.00');
    expect(screen.getByText(/Change comes out of the drawer/)).toBeInTheDocument();
  });

  it('gives change when cash is handed over long', async () => {
    const user = userEvent.setup();
    setup({ routes: twoMethods });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.type(screen.getByLabelText('Amount'), '200');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(till().getByLabelText('Change')).toHaveTextContent('SAR 85.00');
  });

  it('offers nothing to tender with when the shop has no counter method', async () => {
    const user = userEvent.setup();
    setup({
      routes: {
        'GET /api/v1/payment-methods/public': json(200, { data: [] }),
        'POST /api/v1/pos/quote': ({ init }) => {
          const qty = JSON.parse(init.body).items.reduce((n, i) => n + i.qty, 0);
          return json(200, { data: { ...quoteFor(qty), methods: [] } });
        },
      },
    });
    await addShirt(user);
    await toPay('SAR 115.00');
    expect(screen.getByLabelText('Paying with')).toBeDisabled();
    expect(screen.getByLabelText('Amount')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Complete sale' })).toBeDisabled();
  });
});

describe('scanning at the counter', () => {
  const scanned = {
    'GET /api/v1/products/lookup': json(200, {
      data: {
        matchedBy: 'barcode',
        product: { id: 'p1', name: { en: 'Oxford Shirt' } },
        variant: { id: 'v1', sku: 'OX-RED', price: 11_500, options: [] },
      },
    }),
  };

  /** What a barcode scanner is: a keyboard that types fast and presses Enter. */
  const scan = async (code) => {
    const field = await screen.findByLabelText('Scan or search');
    field.focus();
    for (const char of code) {
      fireEvent.keyDown(field, { key: char });
      fireEvent.change(field, { target: { value: field.value + char } });
    }
    fireEvent.keyDown(field, { key: 'Enter' });
  };

  it('puts a scanned product in the basket with nobody clicking anything', async () => {
    setup({ routes: scanned });
    await screen.findByLabelText('Scan or search');

    await scan('6281000000017');

    expect(await screen.findByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
    // And the code it typed on its way through is cleared, ready for the next one.
    await waitFor(() => expect(screen.getByLabelText('Scan or search')).toHaveValue(''));
  });

  it('rings up exactly one of the first item scanned, never two', async () => {
    setup({ routes: scanned });
    await screen.findByLabelText('Scan or search');
    await scan('6281000000017');
    expect(await screen.findByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
  });

  it("counts a scanner's second terminator as part of the same scan, not another item", async () => {
    setup({ routes: scanned });
    const field = await screen.findByLabelText('Scan or search');

    // Plenty of scanners send CR *and* LF after the code.
    await scan('6281000000017');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(await screen.findByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
  });

  it('rings up one more when the same item is scanned again a moment later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup({ routes: scanned });
    await screen.findByLabelText('Scan or search');

    await scan('6281000000017');
    expect(await screen.findByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');

    // Far enough apart to be a hand reaching for the next item.
    vi.advanceTimersByTime(600);
    await scan('6281000000017');
    await waitFor(() => expect(screen.getByLabelText('Quantity of Oxford Shirt')).toHaveValue('2'));
    vi.useRealTimers();
  });

  it('adds the one thing a typed code names, without a click', async () => {
    const user = userEvent.setup();
    setup({
      routes: {
        'GET /api/v1/products/lookup': json(404, {
          error: { code: 'NOT_FOUND', message: 'No product with this barcode or SKU' },
        }),
      },
    });
    const field = await screen.findByLabelText('Scan or search');
    await user.type(field, 'OX-RED');
    await screen.findByRole('button', { name: /Oxford Shirt/ });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(await screen.findByLabelText('Quantity of Oxford Shirt')).toHaveValue('1');
  });

  it('says so when a scanned code is nothing the shop sells', async () => {
    setup({
      routes: {
        'GET /api/v1/products/lookup': json(404, {
          error: { code: 'NOT_FOUND', message: 'No product with this barcode or SKU' },
        }),
        'GET /api/v1/pos/search': json(200, { data: [] }),
      },
    });
    await screen.findByLabelText('Scan or search');
    await scan('0000000000000');
    expect(await screen.findByText(/0000000000000/)).toBeInTheDocument();
  });
});

describe('splitting the money, method after method', () => {
  const twoWays = {
    'GET /api/v1/payment-methods/public': json(200, {
      data: [
        { key: 'cash', type: 'cash', label: 'Cash' },
        { key: 'card', type: 'offline', label: 'Card terminal' },
      ],
    }),
    'POST /api/v1/pos/quote': ({ init }) => {
      const qty = JSON.parse(init.body).items.reduce((n, i) => n + i.qty, 0);
      return json(200, {
        data: {
          ...quoteFor(qty, 11_500 * qty),
          methods: [
            { key: 'cash', type: 'cash', label: 'Cash' },
            { key: 'card', type: 'offline', label: 'Card terminal' },
          ],
        },
      });
    },
  };

  it('offers what is still due as the next amount, tender after tender', async () => {
    const user = userEvent.setup();
    setup({ routes: twoWays });
    await addShirt(user);
    await toPay('SAR 115.00');

    // The box starts on the whole sale…
    expect(screen.getByLabelText('Amount')).toHaveValue('115.00');

    // …take 50 on the card, and it follows the balance down by itself.
    await user.selectOptions(screen.getByLabelText('Paying with'), 'card');
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(till().getByLabelText('Still to pay')).toHaveTextContent('SAR 65.00');
    expect(screen.getByLabelText('Amount')).toHaveValue('65.00');

    // One more tender clears it, and the box has nothing left to offer.
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(till().getByLabelText('Change')).toHaveTextContent('SAR 0.00');
    expect(screen.getByLabelText('Amount')).toHaveValue('');
  });

  it('adds a second method as extra money, which comes back as change', async () => {
    const user = userEvent.setup();
    setup({ routes: twoWays });
    await addShirt(user);
    await toPay('SAR 115.00');

    // Cash for the whole bill…
    await user.click(screen.getByRole('button', { name: 'Settle what is due with Cash' }));
    expect(screen.getByLabelText('Tendered')).toHaveTextContent('SAR 115.00');

    // …then 50 more on the card: extra money, not a correction of the cash.
    await user.selectOptions(screen.getByLabelText('Paying with'), 'card');
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const tenders = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(tenders.some((l) => /Cash/.test(l) && /115\.00/.test(l))).toBe(true);
    expect(tenders.some((l) => /Card terminal/.test(l) && /50\.00/.test(l))).toBe(true);
    expect(screen.getByLabelText('Tendered')).toHaveTextContent('SAR 165.00');
    expect(screen.getByLabelText('Change')).toHaveTextContent('SAR 50.00');
    // There is cash on the ticket, so the drawer can hand it back.
    expect(screen.queryByText(/Change comes out of the drawer/)).toBeNull();
  });

  it('takes a second method after the Add button settled the whole bill', async () => {
    const user = userEvent.setup();
    setup({ routes: twoWays });
    await addShirt(user);
    await toPay('SAR 115.00');

    // Settle the lot in cash using Add, with the box on the balance it offers.
    await user.selectOptions(screen.getByLabelText('Paying with'), 'cash');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('Change')).toHaveTextContent('SAR 0.00');

    // A second method must still go on — and it is counted, not swallowed.
    await user.selectOptions(screen.getByLabelText('Paying with'), 'card');
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByLabelText('Tendered')).toHaveTextContent('SAR 165.00');
    expect(screen.getByLabelText('Change')).toHaveTextContent('SAR 50.00');
  });

  it('gives change when cash is handed over a bill that is already settled', async () => {
    const user = userEvent.setup();
    setup({ routes: twoWays });
    await addShirt(user);
    await toPay('SAR 115.00');

    await user.click(screen.getByRole('button', { name: 'Settle what is due with Card terminal' }));
    await user.selectOptions(screen.getByLabelText('Paying with'), 'cash');
    await user.type(screen.getByLabelText('Amount'), '150');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByLabelText('Tendered')).toHaveTextContent('SAR 265.00');
    expect(screen.getByLabelText('Change')).toHaveTextContent('SAR 150.00');
  });

  it("sends the tenders as rung up, without the screen's own notes", async () => {
    const user = userEvent.setup();
    const m = setup({ routes: twoWays });
    await addShirt(user);
    await toPay('SAR 115.00');
    await user.click(screen.getByRole('button', { name: 'Settle what is due with Cash' }));
    await user.selectOptions(screen.getByLabelText('Paying with'), 'card');
    await user.type(screen.getByLabelText('Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Complete sale' }));

    await waitFor(() => expect(m.count('POST /api/v1/pos/sales')).toBe(1));
    const sent = JSON.parse(
      m.calls.filter((c) => c.key === 'POST /api/v1/pos/sales').at(-1).init.body,
    );
    // As entered, and without the screen's own note about the method's type.
    expect(sent.payments).toEqual([
      { method: 'cash', amount: 11_500 },
      { method: 'card', amount: 5000 },
    ]);
  });
});
