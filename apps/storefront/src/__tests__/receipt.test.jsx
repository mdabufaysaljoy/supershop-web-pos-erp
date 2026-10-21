// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zatcaQr } from '@supershop/shared';
import en from '@/i18n/dictionaries/en.json';
import { I18nProvider } from '@/i18n/I18nProvider';
import { pickNamespaces } from '@/i18n/translate';
import { ReceiptView } from '@/components/receipt/ReceiptView';

const SAMPLE_RECEIPT = {
  orderNo: 'POS-000042',
  status: 'paid',
  channel: 'pos',
  placedAt: '2026-10-14T14:30:00.000Z',
  cashierName: 'Sarah',
  branchName: 'Main store',
  currency: 'SAR',
  shop: {
    name: 'Wafa Supershop',
    address: 'Riyadh, KSA',
    phone: '+966500000000',
    vatNumber: '300000000000003',
  },
  items: [
    {
      name: 'Oxford Shirt',
      sku: 'OX-RED-L',
      qty: 2,
      unitPrice: 11500,
      discountTotal: 1500,
      lineTotal: 21500,
    },
  ],
  totals: {
    itemCount: 2,
    subtotal: 23000,
    discountTotal: 1500,
    net: 18696,
    vat: 2804,
    total: 21500,
  },
  payments: [{ method: 'cash', label: 'Cash', amount: 25000 }],
  changeGiven: 3500,
  zatcaQr: zatcaQr({
    sellerName: 'Wafa Supershop',
    vatNumber: '300000000000003',
    timestamp: '2026-10-14T14:30:00.000Z',
    total: 21500,
    vat: 2804,
  }),
};

const json = (status, body) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Digital Sales Receipt View', () => {
  it('loads and renders the official verified digital receipt with line items and VAT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (String(url).includes('/api/v1/checkout/receipt/POS-000042')) {
          return json(200, { data: SAMPLE_RECEIPT });
        }
        return json(404, { error: { message: 'Not found' } });
      }),
    );

    render(
      <I18nProvider
        lang="en"
        locale="en-SA"
        direction="ltr"
        dict={pickNamespaces(en, ['receipt', 'track'])}
      >
        <ReceiptView orderNo="POS-000042" />
      </I18nProvider>,
    );

    expect(await screen.findByText('Wafa Supershop')).toBeInTheDocument();
    expect(screen.getByText('POS-000042')).toBeInTheDocument();
    expect(screen.getByText('Oxford Shirt')).toBeInTheDocument();
    // A customer's receipt names the product, not the shop's own stock code.
    expect(screen.queryByText(/OX-RED-L/)).toBeNull();
    expect(screen.getByText('Official Receipt · Verified')).toBeInTheDocument();
    expect(screen.getByText('Simplified Tax Invoice')).toBeInTheDocument();
    expect(screen.getByText(/300000000000003/)).toBeInTheDocument();
    expect(screen.getByText('Print Receipt')).toBeInTheDocument();
  });

  it('displays a friendly not found card when receipt does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => json(404, { error: { status: 404, message: 'Receipt not found' } })),
    );

    render(
      <I18nProvider
        lang="en"
        locale="en-SA"
        direction="ltr"
        dict={pickNamespaces(en, ['receipt', 'track'])}
      >
        <ReceiptView orderNo="INVALID-999" />
      </I18nProvider>,
    );

    expect(
      await screen.findByText('Receipt not found. Please check the receipt number.'),
    ).toBeInTheDocument();
    expect(screen.getByText('INVALID-999')).toBeInTheDocument();
    expect(screen.getByText('Back to Store')).toBeInTheDocument();
  });
});
