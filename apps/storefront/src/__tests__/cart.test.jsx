// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/dictionaries/en.json';
import { I18nProvider } from '@/i18n/I18nProvider';
import { pickNamespaces } from '@/i18n/translate';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const { CartProvider } = await import('@/components/cart/CartProvider');
const { CartButton } = await import('@/components/cart/CartButton');
const { AddToCart } = await import('@/components/cart/AddToCart');

const FMT = {
  lang: 'en',
  digits: 'latn',
  timeZone: 'Asia/Riyadh',
  calendar: 'gregorian',
  currency: 'SAR',
};
const line = (over = {}) => ({
  variantId: 'v1',
  productId: 'p1',
  slug: 'oxford',
  name: 'Oxford Shirt',
  options: [{ name: 'Color', value: 'Red' }],
  sku: 'OX-RED',
  image: null,
  unitPrice: 11500,
  compareAtPrice: null,
  qty: 2,
  maxQty: 5,
  lineTotal: 23000,
  status: 'ok',
  notices: [],
  ...over,
});
const view = (items) => ({
  items,
  totals: {
    itemCount: items.reduce((n, l) => n + l.qty, 0),
    subtotal: 23000,
    net: 20000,
    vat: 3000,
    total: 23000,
  },
  currency: 'SAR',
  pricesIncludeVat: true,
  vatRateBps: 1500,
});
const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

function setup(handler) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal('fetch', fetchMock);
  render(
    <I18nProvider lang="en" dict={pickNamespaces(en)}>
      <CartProvider fmtOptions={FMT}>
        <CartButton />
        <AddToCart variant={{ id: 'v1', inStock: true }} productName="Oxford Shirt" />
      </CartProvider>
    </I18nProvider>,
  );
  return fetchMock;
}
const call = (m, method) => m.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

afterEach(() => vi.unstubAllGlobals());

describe('cart UI', () => {
  it('loads the cart once and shows the count on the header button', async () => {
    const m = setup(() => json(200, { data: view([line()]) }));
    expect(await screen.findByRole('button', { name: 'Open cart (2 items)' })).toBeInTheDocument();
    expect(call(m, 'GET')).toHaveLength(1);
    expect(call(m, 'GET')[0][0]).toBe('/api/v1/cart?lang=en');
  });

  it('adds to cart with the CSRF header and opens the mini-cart with lines and totals', async () => {
    let items = [];
    const m = setup((url, init) => {
      if (init?.method === 'POST')
        items = [line({ notices: [{ code: 'qty_reduced', from: 6, to: 5 }], qty: 5 })];
      return json(200, { data: view(items) });
    });
    await screen.findByRole('button', { name: 'Open cart (0 items)' });
    await userEvent.click(screen.getByRole('button', { name: 'More Oxford Shirt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    const [, init] = call(m, 'POST')[0];
    expect(JSON.parse(init.body)).toEqual({ variantId: 'v1', qty: 2 });
    expect(init.headers['X-CSRF-Protection']).toBe('1');
    const dialog = await screen.findByRole('dialog', { name: /Your cart/ });
    expect(within(dialog).getByRole('link', { name: 'Oxford Shirt' })).toHaveAttribute(
      'href',
      '/product/oxford',
    );
    expect(within(dialog).getByText('Color: Red')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Only 5 can be ordered. We updated the quantity.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Includes VAT (15%)')).toBeInTheDocument();
    expect(within(dialog).getAllByText('SAR 230.00').length).toBeGreaterThan(0);
    // At the maximum: "+" is disabled.
    expect(within(dialog).getByRole('button', { name: 'More Oxford Shirt' })).toBeDisabled();
  });

  it('changes quantities and removes lines through the API', async () => {
    let items = [line()];
    const m = setup((url, init) => {
      if (init?.method === 'PATCH') items = [line({ qty: JSON.parse(init.body).qty })];
      if (init?.method === 'DELETE') items = [];
      return json(200, { data: view(items) });
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Open cart (2 items)' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fewer Oxford Shirt' }));
    await waitFor(() => expect(call(m, 'PATCH')).toHaveLength(1));
    expect(call(m, 'PATCH')[0][0]).toBe('/api/v1/cart/items/v1?lang=en');
    expect(JSON.parse(call(m, 'PATCH')[0][1].body)).toEqual({ qty: 1 });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Oxford Shirt' }));
    expect(await within(dialog).findByText('Your cart is empty.')).toBeInTheDocument();
  });

  it('flags out-of-stock lines and explains add-to-cart errors', async () => {
    setup((url, init) =>
      init?.method === 'POST'
        ? json(409, { error: { code: 'OUT_OF_STOCK', message: 'x' } })
        : json(200, { data: view([line({ status: 'out_of_stock', lineTotal: null, maxQty: 0 })]) }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('Sorry, this item is out of stock.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open cart (2 items)' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('Out of stock — not included in the total.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'More Oxford Shirt' })).toBeDisabled();
  });
});
