// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/dictionaries/en.json';
import { I18nProvider } from '@/i18n/I18nProvider';
import { pickNamespaces } from '@/i18n/translate';

/** P3.6 — "where is my order?" by order number + the phone it was placed with. */
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => '/track',
}));

const { CartProvider } = await import('@/components/cart/CartProvider');
const { TrackOrderView } = await import('@/components/track/TrackOrderView');

const FMT = {
  lang: 'en',
  digits: 'latn',
  timeZone: 'Asia/Riyadh',
  calendar: 'gregorian',
  currency: 'SAR',
};
const ORDER = {
  orderNo: 'ORD-000007',
  status: 'shipped',
  placedAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-14T06:00:00.000Z',
  customerName: 'Sara Ali',
  deliveryMethod: 'delivery',
  city: 'Riyadh',
  items: [
    {
      name: 'Oxford Shirt',
      options: [{ name: 'Color', value: 'Red' }],
      image: null,
      qty: 2,
      lineTotal: 23000,
    },
  ],
  totals: { itemCount: 2, total: 25300 },
  currency: 'SAR',
  payment: { method: 'cod', status: 'pending' },
};
const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

function setup(track) {
  const fetchMock = vi.fn((url) => {
    const u = String(url);
    if (u.startsWith('/api/v1/cart')) return json(200, { data: { items: [], totals: {} } });
    if (u.startsWith('/api/v1/checkout/track')) return track(u);
    return json(404, { error: { code: 'NOT_FOUND' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <I18nProvider lang="en" dict={pickNamespaces(en)}>
      <CartProvider fmtOptions={FMT}>
        <TrackOrderView />
      </CartProvider>
    </I18nProvider>,
  );
  return fetchMock;
}
const submit = async (number, phone) => {
  await userEvent.type(screen.getByLabelText(/^Order number/), number);
  await userEvent.type(screen.getByLabelText(/^Mobile number/), phone);
  await userEvent.click(screen.getByRole('button', { name: 'Find my order' }));
};

afterEach(() => {
  vi.unstubAllGlobals();
  search = new URLSearchParams();
});

describe('tracking an order', () => {
  it('asks the API with a normalized number and phone and draws the progress', async () => {
    const m = setup(() => json(200, { data: ORDER }));
    await submit('ord-000007', '٠٥١٢٣٤٥٦٧٨');

    await screen.findByText('ORD-000007');
    const asked = m.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/track'));
    expect(asked).toContain('number=ORD-000007');
    expect(asked).toContain(encodeURIComponent('+966512345678'));

    const steps = within(screen.getByRole('list', { name: 'Order progress' }));
    expect(steps.getByText('Order placed')).toBeInTheDocument();
    expect(steps.getByText('On its way')).toBeInTheDocument();
    expect(screen.getByText('Where your order is now')).toBeInTheDocument();
    expect(screen.getByText('Oxford Shirt')).toBeInTheDocument();
    expect(screen.getByText('SAR 253.00')).toBeInTheDocument();
    expect(
      screen.getByText(/Payment: Cash payment on delivery — due on delivery/),
    ).toBeInTheDocument();
  });

  it('explains a wrong number or phone without saying which one was wrong', async () => {
    setup(() => json(404, { error: { code: 'NOT_FOUND' } }));
    await submit('ORD-000009', '0512345678');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We cannot find an order with that number and mobile number.',
    );
  });

  it('validates before asking the API', async () => {
    const m = setup(() => json(200, { data: ORDER }));
    await submit('nonsense', '0512345678');
    expect(m.mock.calls.some(([u]) => String(u).includes('/track'))).toBe(false);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('looks the order up straight away when the link carries both values', async () => {
    search = new URLSearchParams('order=ORD-000007&phone=0512345678');
    setup(() => json(200, { data: ORDER }));
    expect(await screen.findByText('ORD-000007')).toBeInTheDocument();
  });

  it('replaces the steps with one clear line for an order that stopped', async () => {
    setup(() => json(200, { data: { ...ORDER, status: 'cancelled' } }));
    await submit('ORD-000007', '0512345678');
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText(/This order was cancelled/)).toBeInTheDocument();
    expect(screen.queryByText('Where your order is now')).not.toBeInTheDocument();
  });
});
