// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/dictionaries/en.json';
import { I18nProvider } from '@/i18n/I18nProvider';
import { pickNamespaces } from '@/i18n/translate';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const { CartProvider } = await import('@/components/cart/CartProvider');
const { AuthProvider } = await import('@/components/account/AuthProvider');
const { CheckoutView } = await import('@/components/checkout/CheckoutView');
const { OrderConfirmation } = await import('@/components/checkout/OrderConfirmation');

const FMT = {
  lang: 'en',
  digits: 'latn',
  timeZone: 'Asia/Riyadh',
  calendar: 'gregorian',
  currency: 'SAR',
};
const CART = {
  items: [
    {
      variantId: 'v1',
      productId: 'p1',
      slug: 'shirt',
      name: 'Oxford Shirt',
      options: [{ name: 'Color', value: 'Red' }],
      sku: 'OX-RED',
      image: null,
      unitPrice: 11500,
      compareAtPrice: null,
      taxCategory: 'standard',
      qty: 2,
      maxQty: 5,
      lineTotal: 23000,
      status: 'ok',
      notices: [],
    },
  ],
  totals: { itemCount: 2, subtotal: 23000, net: 20000, vat: 3000, total: 23000 },
  currency: 'SAR',
  pricesIncludeVat: true,
  vatRateBps: 1500,
};
const ORDER = {
  id: 'o1',
  orderNo: 'ORD-000007',
  status: 'pending',
  placedAt: '2026-10-13T09:00:00.000Z',
  customer: { name: 'Sara Ali', phone: '+966512345678', email: 'sara@example.com' },
  address: { line1: 'King Fahd Rd', city: 'Riyadh', district: null, postalCode: '12345' },
  items: [
    {
      variantId: 'v1',
      productId: 'p1',
      sku: 'OX-RED',
      name: 'Oxford Shirt',
      options: [{ name: 'Color', value: 'Red' }],
      unitPrice: 11500,
      qty: 2,
      lineTotal: 23000,
      image: null,
    },
  ],
  totals: { itemCount: 2, subtotal: 23000, deliveryFee: 2300, net: 22000, vat: 3300, total: 25300 },
  currency: 'SAR',
  pricesIncludeVat: true,
  payment: { method: 'cod', status: 'pending' },
  customFields: {},
  note: '',
};
const FIELDS = [
  {
    key: 'gift_note',
    type: 'text',
    label: 'Gift message',
    placeholder: '',
    helpText: '',
    required: true,
    min: null,
    max: 40,
    options: [],
  },
];
const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

const METHOD = {
  cod: { key: 'cod', type: 'cod', label: 'Cash payment on delivery', fee: { fixed: 0, bps: 0 } },
  card: {
    key: 'card',
    type: 'gateway',
    label: 'Card, Mada or Apple Pay',
    fee: { fixed: 0, bps: 0 },
  },
};

function setup(handler, { fields = [], cart = CART, methods = [METHOD.cod] } = {}) {
  const fetchMock = vi.fn((url, init) => {
    const u = String(url);
    if (u.startsWith('/api/v1/cart')) return json(200, { data: cart });
    // No refresh cookie in tests: the shopper is a guest, like most people at checkout.
    if (u.startsWith('/api/v1/auth/') || u.startsWith('/api/v1/account'))
      return json(401, { error: { code: 'UNAUTHENTICATED' } });
    return handler(u, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <I18nProvider lang="en" dict={pickNamespaces(en)}>
      <CartProvider fmtOptions={FMT}>
        <AuthProvider>
          <CheckoutView
            fields={fields}
            methods={methods}
            deliveryFee={2300}
            freeDeliveryOver={50000}
          />
        </AuthProvider>
      </CartProvider>
    </I18nProvider>,
  );
  return fetchMock;
}
const fill = async () => {
  await userEvent.type(screen.getByLabelText(/^Full name/), 'Sara Ali');
  await userEvent.type(screen.getByLabelText(/^Mobile number/), '0512345678');
  await userEvent.type(screen.getByLabelText(/^Street and building/), 'King Fahd Rd 12');
  await userEvent.type(screen.getByLabelText(/^City/), 'Riyadh');
};
const posted = (m) =>
  m.mock.calls.filter(([u, i]) => i?.method === 'POST' && String(u).startsWith('/api/v1/checkout'));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe('checkout form', () => {
  it('shows the order summary with delivery and sends the form, then goes to the confirmation', async () => {
    const m = setup((u, init) =>
      init?.method === 'POST'
        ? json(201, { data: { ...ORDER, confirmationToken: 'tok-123456789012345' } })
        : json(404, {}),
    );
    await screen.findByText('Oxford Shirt');
    const summary = screen.getByLabelText('Items in your order');
    expect(within(summary).getByText('SAR 23.00')).toBeInTheDocument(); // delivery
    expect(within(summary).getByText('SAR 253.00')).toBeInTheDocument(); // total with delivery
    expect(within(summary).getByText('Add SAR 270.00 more for free delivery.')).toBeInTheDocument();

    await fill();
    await userEvent.type(screen.getByLabelText(/^Note with your order/), 'Call me');
    await userEvent.click(screen.getByRole('button', { name: 'Send my order' }));
    await waitFor(() => expect(posted(m)).toHaveLength(1));
    const [, init] = posted(m)[0];
    expect(JSON.parse(init.body)).toEqual({
      contact: { name: 'Sara Ali', phone: '+966512345678', email: null },
      deliveryMethod: 'delivery',
      address: expect.objectContaining({ city: 'Riyadh', line1: 'King Fahd Rd 12' }),
      paymentMethod: 'cod',
      note: 'Call me',
      customFields: {},
    });
    expect(init.headers['X-CSRF-Protection']).toBe('1');
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/checkout/confirmation?token=tok-123456789012345'),
    );
  });

  it('validates before sending and shows server field errors', async () => {
    const m = setup(
      (u, init) =>
        init?.method === 'POST'
          ? json(400, {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'x',
                details: [{ path: 'customFields.gift_note', message: 'validation.tooLong' }],
              },
            })
          : json(404, {}),
      { fields: FIELDS },
    );
    await screen.findByText('Oxford Shirt');
    await userEvent.click(screen.getByRole('button', { name: 'Send my order' }));
    expect(screen.getByLabelText(/^Full name/)).toHaveAttribute('aria-invalid', 'true');
    expect(posted(m)).toHaveLength(0);

    await fill();
    await userEvent.type(screen.getByLabelText(/^Gift message/), 'Happy Eid');
    await userEvent.click(screen.getByRole('button', { name: 'Send my order' }));
    await waitFor(() => expect(posted(m)).toHaveLength(1));
    expect(JSON.parse(posted(m)[0][1].body).customFields).toEqual({ gift_note: 'Happy Eid' });
    expect(await screen.findByText('Too long.')).toBeInTheDocument();
  });

  it('explains a cart problem, refreshes the cart and uses a new key for the next try', async () => {
    let first = true;
    const m = setup((u, init) => {
      if (init?.method !== 'POST') return json(404, {});
      if (first) {
        first = false;
        return json(409, { error: { code: 'OUT_OF_STOCK', message: 'x', details: [] } });
      }
      return json(201, { data: { ...ORDER, confirmationToken: 'tok-123456789012345' } });
    });
    await screen.findByText('Oxford Shirt');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send my order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available');
    await userEvent.click(screen.getByRole('button', { name: 'Send my order' }));
    await waitFor(() => expect(posted(m)).toHaveLength(2));
    const [k1, k2] = posted(m).map(([, i]) => i.headers['Idempotency-Key']);
    expect(k1).not.toBe(k2); // a rejected attempt must not be replayed as the old one
  });

  it('offers nothing to order when the cart is empty', async () => {
    setup(() => json(404, {}), {
      cart: { ...CART, items: [], totals: { ...CART.totals, itemCount: 0 } },
    });
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send my order' })).toBeNull();
  });
});

describe('paying by card (P4.1)', () => {
  /** jsdom has no navigation: capture where the browser would have gone. */
  const captureNavigation = () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
    return assign;
  };

  it('offers only the methods the shop can take, cash first', async () => {
    setup(() => json(404, {}), { methods: [METHOD.cod] });
    await screen.findByText('Oxford Shirt');
    expect(screen.getByLabelText(/Cash payment on delivery/)).toBeChecked();
    expect(screen.queryByLabelText(/Card, Mada or Apple Pay/)).toBeNull();
  });

  it('sends the customer to the payment page instead of the confirmation', async () => {
    const assign = captureNavigation();
    const m = setup(
      (u, init) =>
        init?.method === 'POST'
          ? json(201, {
              data: {
                ...ORDER,
                confirmationToken: 'tok-123456789012345',
                payment: {
                  method: 'card',
                  status: 'pending',
                  redirectUrl: 'https://pay.test/inv_1',
                },
              },
            })
          : json(404, {}),
      { methods: [METHOD.cod, METHOD.card] },
    );
    await screen.findByText('Oxford Shirt');
    await userEvent.click(screen.getByLabelText(/Card, Mada or Apple Pay/));
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send my order' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.test/inv_1'));
    expect(push).not.toHaveBeenCalled();
    expect(JSON.parse(posted(m)[0][1].body).paymentMethod).toBe('card');
  });
});

describe('confirmation page', () => {
  const renderConfirmation = (token, handler) => {
    vi.stubGlobal('fetch', vi.fn(handler));
    render(
      <I18nProvider lang="en" dict={pickNamespaces(en)}>
        <CartProvider fmtOptions={FMT}>
          <OrderConfirmation token={token} fmtOptions={FMT} />
        </CartProvider>
      </I18nProvider>,
    );
  };

  it('loads the order from the link token and shows what was ordered', async () => {
    renderConfirmation('tok-123456789012345', (url) =>
      String(url).includes('/confirmation')
        ? json(200, { data: ORDER })
        : json(200, { data: { ...CART, items: [] } }),
    );
    expect(await screen.findByText('ORD-000007')).toBeInTheDocument();
    expect(screen.getByText(/Oxford Shirt/)).toBeInTheDocument();
    expect(screen.getByText('SAR 253.00')).toBeInTheDocument();
    expect(screen.getByText('Cash payment on delivery')).toBeInTheDocument();
    expect(screen.getByText(/King Fahd Rd, Riyadh, 12345/)).toBeInTheDocument();
  });

  it('says so when the link is wrong', async () => {
    renderConfirmation('nope', (url) =>
      String(url).includes('/confirmation')
        ? json(404, { error: { code: 'NOT_FOUND', message: 'x' } })
        : json(200, { data: { ...CART, items: [] } }),
    );
    expect(await screen.findByText(/can't find that order/)).toBeInTheDocument();
  });
});

describe('an unfinished card payment', () => {
  const renderConfirmation = (token, handler) => {
    vi.stubGlobal('fetch', vi.fn(handler));
    render(
      <I18nProvider lang="en" dict={pickNamespaces(en)}>
        <CartProvider fmtOptions={FMT}>
          <OrderConfirmation token={token} fmtOptions={FMT} />
        </CartProvider>
      </I18nProvider>,
    );
  };
  const CARD_ORDER = { ...ORDER, payment: { method: 'card', status: 'pending' } };

  it('keeps the order and offers a new payment page', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
    renderConfirmation('tok-123456789012345', (url) => {
      const u = String(url);
      if (u.includes('/payments/retry'))
        return json(200, { data: { redirectUrl: 'https://pay.test/inv_2' } });
      if (u.includes('/confirmation')) return json(200, { data: CARD_ORDER });
      return json(200, { data: { ...CART, items: [] } });
    });

    expect(await screen.findByText('Your payment is not finished')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.test/inv_2'));
  });

  it('says nothing about payment when the order is paid', async () => {
    renderConfirmation('tok-123456789012345', (url) =>
      String(url).includes('/confirmation')
        ? json(200, { data: { ...ORDER, payment: { method: 'card', status: 'paid' } } })
        : json(200, { data: { ...CART, items: [] } }),
    );
    expect(await screen.findByText('ORD-000007')).toBeInTheDocument();
    expect(screen.queryByText('Your payment is not finished')).toBeNull();
  });
});
