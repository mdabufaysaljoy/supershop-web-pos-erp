import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { ProductTransferPage } from '../pages/ProductTransferPage';

const job = (extra) => ({
  id: 'j1',
  type: 'import',
  status: 'done',
  format: 'csv',
  fileName: 'products.csv',
  mode: 'upsert',
  dryRun: true,
  counts: { rows: 3, products: 2, processed: 2, created: 1, updated: 0, failed: 1 },
  errorCount: 1,
  ignoredColumns: ['notes'],
  failure: null,
  downloadable: false,
  createdAt: '2026-10-08T10:00:00.000Z',
  errors: [{ row: 3, column: 'barcode', message: 'validation.code.checksum' }],
  ...extra,
});

function setup(routes, permissions = ['product.import', 'product.export']) {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 't',
    profile: { name: 'A' },
    access: { permissions },
  });
  const m = mockFetch({
    'GET /api/v1/product-transfers/jobs': () => json(200, { data: [] }),
    ...routes,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ProductTransferPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return m;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('Import & export page', () => {
  it('uploads a file for validation and shows the row report', async () => {
    let polls = 0;
    const m = setup({
      'POST /api/v1/product-transfers/imports': () =>
        json(202, { data: job({ status: 'queued', errors: undefined }) }),
      'GET /api/v1/product-transfers/jobs/j1': () =>
        json(200, { data: polls++ ? job() : job({ status: 'running' }) }),
    });
    await userEvent.upload(
      screen.getByTestId('import-file'),
      new File(['product_key,sku,price\n'], 'products.csv', { type: 'text/csv' }),
    );
    expect(screen.getByText('products.csv')).toBeInTheDocument();
    expect(screen.getByLabelText(/Validate only/)).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Validate file' }));
    await waitFor(() => expect(m.count('POST /api/v1/product-transfers/imports')).toBe(1));
    const sent = m.calls.find((c) => c.key === 'POST /api/v1/product-transfers/imports').init.body;
    expect([sent.get('mode'), sent.get('dryRun'), sent.get('file').name]).toEqual([
      'upsert',
      'true',
      'products.csv',
    ]);

    expect(
      await screen.findByText(/Would create 1, update 0; 1 with problems/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The check digit is wrong — re-scan or re-type the barcode.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ignored columns: notes')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download report' }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('exports and downloads the file; template download uses the API', async () => {
    const m = setup({
      'POST /api/v1/product-transfers/exports': () =>
        json(202, { data: job({ id: 'e1', type: 'export', status: 'queued', dryRun: false }) }),
      'GET /api/v1/product-transfers/jobs/e1': () =>
        json(200, {
          data: job({
            id: 'e1',
            type: 'export',
            dryRun: false,
            downloadable: true,
            counts: { products: 5, rows: 9 },
            errors: [],
          }),
        }),
      'GET /api/v1/product-transfers/jobs/e1/download': () =>
        new Response('xlsx-bytes', {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="products-2026-10-08.xlsx"' },
        }),
      'GET /api/v1/product-transfers/template': () =>
        new Response('csv', {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="products-template.csv"' },
        }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'CSV template' }));
    await waitFor(() =>
      expect(
        m.calls
          .find((c) => c.key === 'GET /api/v1/product-transfers/template')
          .url.searchParams.get('format'),
      ).toBe('csv'),
    );
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'active');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const sent = JSON.parse(
      m.calls.find((c) => c.key === 'POST /api/v1/product-transfers/exports').init.body,
    );
    expect(sent).toEqual({ format: 'xlsx', filters: { status: 'active' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Download file' }));
    await waitFor(() => expect(m.count('GET /api/v1/product-transfers/jobs/e1/download')).toBe(1));
  });

  it('shows only the sections the user may use', async () => {
    setup({}, ['product.export']);
    expect(await screen.findByRole('heading', { name: 'Export products' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Import products' })).toBeNull();
  });
});
