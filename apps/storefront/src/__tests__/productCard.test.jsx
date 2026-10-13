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
const { CartButton } = await import('@/components/cart/CartButton');
const { ProductCard } = await import('@/components/catalog/ProductCard');

const FMT = {
  lang: 'en',
  digits: 'latn',
  timeZone: 'Asia/Riyadh',
  calendar: 'gregorian',
  currency: 'SAR',
};
const img = (id) => ({ id, url: `https://cdn/${id}.webp`, width: 800, height: 800, sources: [] });
const RICE = {
  id: 'p1',
  slug: 'rice',
  name: 'Basmati Rice',
  image: img('rice'),
  priceMin: 3450,
  priceMax: 3450,
  compareAtPrice: null,
  brand: null,
  inStock: true,
  defaultVariantId: 'v-rice',
  swatches: null,
};
const SHIRT = {
  ...RICE,
  id: 'p2',
  slug: 'linen-shirt',
  name: 'Linen Shirt',
  image: img('main'),
  priceMin: 14900,
  priceMax: 15900,
  defaultVariantId: null,
  swatches: {
    key: 'color',
    name: 'Color',
    values: [
      { key: 'red', label: 'Red', swatch: '#c82832', image: img('red'), inStock: true },
      { key: 'navy', label: 'Navy', swatch: '#1e286e', image: img('navy'), inStock: false },
    ],
  },
};
const PRODUCT = {
  id: 'p2',
  slug: 'linen-shirt',
  name: 'Linen Shirt',
  images: [img('red'), img('navy')],
  options: [
    {
      key: 'color',
      name: 'Color',
      values: [
        { key: 'red', label: 'Red' },
        { key: 'navy', label: 'Navy' },
      ],
    },
  ],
  variants: [
    {
      id: 'v-red',
      sku: 'LN-R',
      optionValues: { color: 'red' },
      price: 14900,
      compareAtPrice: null,
      imageIds: ['red'],
      inStock: true,
    },
    {
      id: 'v-navy',
      sku: 'LN-N',
      optionValues: { color: 'navy' },
      price: 15900,
      compareAtPrice: null,
      imageIds: ['navy'],
      inStock: true,
    },
  ],
  priceMin: 14900,
  priceMax: 15900,
  inStock: true,
};
const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
const cartView = (n) => ({
  items: [],
  totals: { itemCount: n, subtotal: 0, net: 0, vat: 0, total: 0 },
  currency: 'SAR',
  pricesIncludeVat: true,
  vatRateBps: 1500,
});

function setup(card) {
  let count = 0;
  const fetchMock = vi.fn((url, init) => {
    if (String(url).startsWith('/api/v1/products/public/')) return json(200, { data: PRODUCT });
    if (init?.method === 'POST') count += JSON.parse(init.body).qty;
    return json(200, { data: cartView(count) });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <I18nProvider lang="en" dict={pickNamespaces(en)}>
      <CartProvider fmtOptions={FMT}>
        <CartButton />
        <ProductCard product={card} />
      </CartProvider>
    </I18nProvider>,
  );
  return fetchMock;
}
const posts = (m) =>
  m.mock.calls.filter(([, i]) => i?.method === 'POST').map(([, i]) => JSON.parse(i.body));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe('ProductCard', () => {
  it('adds single-variant products in one click and opens the mini-cart', async () => {
    const m = setup(RICE);
    expect(screen.getByRole('link', { name: 'Basmati Rice' })).toHaveAttribute(
      'href',
      '/product/rice',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add to cart: Basmati Rice' }));
    await waitFor(() => expect(posts(m)).toEqual([{ variantId: 'v-rice', qty: 1 }]));
    expect(await screen.findByRole('dialog', { name: /Your cart/ })).toBeInTheDocument();
  });

  it('"Buy now" adds and goes on to checkout without opening the mini-cart', async () => {
    const m = setup(RICE);
    await userEvent.click(screen.getByRole('button', { name: 'Buy Basmati Rice' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/cart'));
    expect(posts(m)).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('swatches swap the card image and mark sold-out colours', async () => {
    setup(SHIRT);
    // The cross-fade keeps the previous image while it fades out, so look for the new one.
    const sources = () =>
      screen.getAllByRole('img', { name: 'Linen Shirt' }).map((i) => i.getAttribute('src'));
    expect(sources()).toEqual(['https://cdn/main.webp']);
    await userEvent.click(screen.getByRole('button', { name: 'Red' }));
    await waitFor(() => expect(sources()).toContain('https://cdn/red.webp'));
    await userEvent.click(screen.getByRole('button', { name: 'Red' })); // clicking again keeps it
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Navy: out of stock' })).toBeInTheDocument();
  });

  it('opens a quick view for products with options, starting from the chosen swatch', async () => {
    const m = setup(SHIRT);
    await userEvent.click(screen.getByRole('button', { name: 'Red' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose options for Linen Shirt' }));
    const dialog = await screen.findByRole('dialog', { name: 'Linen Shirt' });
    expect(
      await within(dialog).findByRole('button', { name: 'Red', pressed: true }),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Navy' }));
    expect(within(dialog).getByText('SAR 159.00')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(posts(m)).toEqual([{ variantId: 'v-navy', qty: 1 }]));
    expect(m.mock.calls.find(([u]) => String(u).startsWith('/api/v1/products/public/'))[0]).toBe(
      '/api/v1/products/public/linen-shirt?lang=en',
    );
  });
});

describe('loading screens', () => {
  it('render skeletons without route params (Next passes none to loading.jsx)', async () => {
    const { default: ListingLoading } = await import('@/app/[lang]/category/[slug]/loading');
    const { default: ProductLoading } = await import('@/app/[lang]/product/[slug]/loading');
    render(
      <I18nProvider lang="en" dict={pickNamespaces(en)}>
        <ListingLoading />
        <ProductLoading />
      </I18nProvider>,
    );
    expect(screen.getAllByRole('status', { name: 'Please wait' })).toHaveLength(2);
  });
});
