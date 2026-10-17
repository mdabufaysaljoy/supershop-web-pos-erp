import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { json, mockFetch } from '@/test/fetchMock';

/** P6.4 — Settings → Printing: QZ setup, printer profiles, receipt & label template editors. */
const bodyOf = (m, key) => JSON.parse(m.calls.filter((c) => c.key === key).at(-1).init.body);

const SETTINGS = [
  { key: 'store.name', group: 'general', value: 'Supershop', editable: true },
  { key: 'tax.vatNumber', group: 'tax', value: '300000000000003', editable: true },
  { key: 'printing.enabled', group: 'printing', value: true, editable: true },
  { key: 'printing.autoPrintReceipt', group: 'printing', value: true, editable: true },
  {
    key: 'printing.qzCertificate',
    group: 'printing',
    value: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    editable: true,
  },
  {
    key: 'printing.qzPrivateKey',
    group: 'printing',
    value: { isSet: true, masked: '----…KEY-' },
    secret: true,
  },
];

const PROFILES = [
  {
    id: 'p1',
    name: 'Front till',
    printer: 'EPSON TM-T20',
    kind: 'receipt',
    widthMm: 80,
    cut: true,
    openDrawer: false,
    isDefault: true,
  },
];

const TEMPLATES = {
  receipt: {
    lang: 'en',
    widthMm: 80,
    logoMediaId: null,
    logo: null,
    headerText: { en: '' },
    footerText: { en: 'Thank you' },
    fields: {
      showAddress: true,
      showPhone: true,
      showVatNumber: true,
      showBranch: false,
      showCashier: true,
      showCustomer: true,
      showSku: true,
      showVatBreakdown: true,
      showQr: true,
    },
    labels: {
      receipt: { en: 'Receipt' },
      date: { en: 'Date' },
      branch: { en: 'Branch' },
      cashier: { en: 'Served by' },
      subtotal: { en: 'Subtotal' },
      discount: { en: 'Discount' },
      vat: { en: 'VAT' },
      total: { en: 'Total' },
      change: { en: 'Change' },
      customer: { en: 'Customer' },
    },
    preview: {
      widthMm: 80,
      charsPerLine: 48,
      lines: ['Supershop'],
      qr: 'AQlTdXBlcnNob3ACDzMwMDAwMDAwMDAwMDAwMwMUMjAyNi0xMC0xNFQxNDozMDowMFoEBjIxNS4wMAUFNDI4LjA0',
    },
  },
  label: {
    widthMm: 58,
    heightMm: 30,
    barcodeHeight: 64,
    fields: {
      showShopName: false,
      showName: true,
      showVariant: true,
      showPrice: true,
      showSku: false,
      showBarcodeText: true,
    },
  },
};

function setup(permissions = ['settings.view', 'settings.printing'], extraRoutes = {}) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/printing/status': json(200, {
      data: { enabled: true, autoPrintReceipt: true, configured: true },
    }),
    'GET /api/v1/printing/profiles': json(200, { data: PROFILES }),
    'GET /api/v1/printing/templates': json(200, { data: TEMPLATES }),
    'GET /api/v1/settings': json(200, { data: SETTINGS }),
    ...extraRoutes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/settings?tab=printing']}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('Settings → Printing (P6.4)', () => {
  it('shows QZ Tray status, printer profiles, live thermal receipt preview with ZATCA QR, and label preview', async () => {
    setup();
    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Front till')).toBeInTheDocument();
    expect(screen.getByText('EPSON TM-T20')).toBeInTheDocument();

    const receiptPreview = screen.getByTestId('receipt-preview');
    expect(within(receiptPreview).getByText(/Supershop/)).toBeInTheDocument();
    expect(
      within(receiptPreview).getByTestId('receipt-preview-qr').querySelector('svg'),
    ).not.toBeNull();

    const labelPreview = screen.getByTestId('label-preview');
    expect(within(labelPreview).getByText('Oxford Shirt')).toBeInTheDocument();
    expect(within(labelPreview).getByText('58 × 30 mm')).toBeInTheDocument();
  });

  it('adds a printer profile', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.printing'], {
      'POST /api/v1/printing/profiles': ({ init }) =>
        json(201, { data: { id: 'p2', ...JSON.parse(init.body) } }),
    });
    await screen.findByText('Front till');
    await user.type(screen.getByLabelText('Label in admin'), 'Shelf labeler');
    await user.type(screen.getByLabelText('Printer name on the machine'), 'Zebra ZD220');
    await user.selectOptions(screen.getByLabelText('Printer type'), 'label');
    await user.click(screen.getByRole('button', { name: 'Add printer' }));

    await waitFor(() => expect(m.count('POST /api/v1/printing/profiles')).toBe(1));
    expect(bodyOf(m, 'POST /api/v1/printing/profiles')).toMatchObject({
      name: 'Shelf labeler',
      printer: 'Zebra ZD220',
      kind: 'label',
    });
  });

  it('updates the receipt template (language, paper width, footer, fields) and reflects in live preview', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.printing'], {
      'PATCH /api/v1/printing/templates/receipt': ({ init }) =>
        json(200, { data: { ...TEMPLATES.receipt, ...JSON.parse(init.body) } }),
    });
    await screen.findByText('Receipt template');

    await user.selectOptions(screen.getByLabelText('Receipt language'), 'bilingual');
    const footerInput = screen.getByLabelText('Footer line');
    await user.clear(footerInput);
    await user.type(footerInput, 'Visit us again');

    const receiptPreview = screen.getByTestId('receipt-preview');
    expect(within(receiptPreview).getByText(/Visit us again/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save receipt template' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/printing/templates/receipt')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/printing/templates/receipt')).toMatchObject({
      lang: 'bilingual',
      footerText: 'Visit us again',
    });
  });

  it('updates the barcode label template dimensions and fields', async () => {
    const user = userEvent.setup();
    const m = setup(['settings.view', 'settings.printing'], {
      'PATCH /api/v1/printing/templates/label': ({ init }) =>
        json(200, { data: { ...TEMPLATES.label, ...JSON.parse(init.body) } }),
    });
    await screen.findByText('Barcode label template');

    await user.click(screen.getByLabelText('SKU line'));
    expect(
      within(screen.getByTestId('label-preview')).getByText('SKU: OX-RED-L'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save label template' }));
    await waitFor(() => expect(m.count('PATCH /api/v1/printing/templates/label')).toBe(1));
    expect(bodyOf(m, 'PATCH /api/v1/printing/templates/label')).toMatchObject({
      widthMm: 58,
      heightMm: 30,
      fields: expect.objectContaining({ showSku: true }),
    });
  });
});
