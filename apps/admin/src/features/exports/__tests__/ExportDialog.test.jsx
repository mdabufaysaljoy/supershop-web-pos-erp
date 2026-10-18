import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { ExportButton } from '../components/ExportButton';
import { ExportDialog } from '../components/ExportDialog';

const MOCK_RESOURCES = {
  orders: [
    { key: 'orderNumber', label: 'Order Number', type: 'string', default: true, permitted: true },
    { key: 'status', label: 'Status', type: 'string', default: true, permitted: true },
    { key: 'total', label: 'Total', type: 'money', default: true, permitted: true },
    { key: 'cost', label: 'Cost', type: 'money', default: false, permitted: false },
  ],
};

const MOCK_PRESETS = [
  {
    id: 'preset-1',
    name: 'Finance Summary',
    resource: 'orders',
    columns: ['orderNumber', 'total'],
    format: 'csv',
  },
];

const MOCK_JOBS = [
  {
    id: 'job-101',
    resource: 'orders',
    format: 'xlsx',
    status: 'done',
    counts: { rows: 25, processed: 25, failed: 0 },
    downloadable: true,
    fileName: 'orders_20261018.xlsx',
    fileSize: 4096,
    durationMs: 350,
    createdAt: new Date().toISOString(),
  },
];

function renderWithClient(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Export UI components', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'token-123',
      profile: { name: 'Admin User' },
      access: { permissions: ['order.export', 'order.view'], allBranches: true, branchIds: [] },
    });

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders ExportButton and opens ExportDialog on click', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /api/v1/exports/resources': () => json(200, { data: MOCK_RESOURCES }),
      'GET /api/v1/exports/presets': () => json(200, { data: [] }),
      'GET /api/v1/exports/jobs': () => json(200, { data: [] }),
    });

    renderWithClient(<ExportButton resource="orders" />);

    const exportBtn = screen.getByRole('button', { name: /export/i });
    expect(exportBtn).toBeInTheDocument();

    await user.click(exportBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/quick export/i)).toBeInTheDocument();
  });

  it('submits a quick export with chosen format and filters', async () => {
    const user = userEvent.setup();
    let exportPayload = null;

    mockFetch({
      'GET /api/v1/exports/resources': () => json(200, { data: MOCK_RESOURCES }),
      'GET /api/v1/exports/presets': () => json(200, { data: [] }),
      'GET /api/v1/exports/jobs': () => json(200, { data: [] }),
      'POST /api/v1/exports': ({ init }) => {
        exportPayload = JSON.parse(init.body);
        return json(201, {
          data: {
            id: 'job-new',
            resource: exportPayload.resource,
            format: exportPayload.format,
            fileName: 'orders_export.csv',
            status: 'queued',
          },
        });
      },
    });

    renderWithClient(
      <ExportDialog
        open={true}
        onOpenChange={() => {}}
        resource="orders"
        filters={{ status: 'completed' }}
      />,
    );

    // Select CSV format card
    const csvBtn = await screen.findByText(/CSV \(\.csv, UTF-8\)/i);
    await user.click(csvBtn);

    // Click Start Export
    const startBtn = screen.getByRole('button', { name: /start export/i });
    await user.click(startBtn);

    await waitFor(() => {
      expect(exportPayload).toBeTruthy();
    });

    expect(exportPayload.resource).toBe('orders');
    expect(exportPayload.format).toBe('csv');
    expect(exportPayload.filters).toEqual({ status: 'completed' });
  });

  it('supports custom column selection and preset management in builder tab', async () => {
    const user = userEvent.setup();
    let createdPreset = null;
    let exportPayload = null;

    mockFetch({
      'GET /api/v1/exports/resources': () => json(200, { data: MOCK_RESOURCES }),
      'GET /api/v1/exports/presets': () => json(200, { data: MOCK_PRESETS }),
      'GET /api/v1/exports/jobs': () => json(200, { data: [] }),
      'POST /api/v1/exports/presets': ({ init }) => {
        createdPreset = JSON.parse(init.body);
        return json(201, { data: { id: 'preset-2', ...createdPreset } });
      },
      'POST /api/v1/exports': ({ init }) => {
        exportPayload = JSON.parse(init.body);
        return json(201, {
          data: {
            id: 'job-builder',
            resource: exportPayload.resource,
            format: exportPayload.format,
            fileName: 'orders_custom.xlsx',
            status: 'queued',
          },
        });
      },
    });

    renderWithClient(<ExportDialog open={true} onOpenChange={() => {}} resource="orders" />);

    // Switch to Builder tab
    const builderTab = await screen.findByRole('button', { name: /report builder/i });
    await user.click(builderTab);

    // Column checkboxes should be rendered
    expect(await screen.findByText('Order Number')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();

    // Verify unpermitted column checkbox is disabled
    const costCheckbox = screen.getByRole('checkbox', { name: /cost/i });
    expect(costCheckbox).toBeDisabled();

    // Save as preset
    const presetInput = screen.getByPlaceholderText(/preset name/i);
    await user.type(presetInput, 'Audit Set');

    const savePresetBtn = screen.getByRole('button', { name: /save preset/i });
    await user.click(savePresetBtn);

    await waitFor(() => {
      expect(createdPreset).toBeTruthy();
    });
    expect(createdPreset.name).toBe('Audit Set');
    expect(createdPreset.resource).toBe('orders');

    // Click Generate Report
    const generateBtn = screen.getByRole('button', { name: /generate report/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(exportPayload).toBeTruthy();
    });
    expect(exportPayload.columns).toBeDefined();
    expect(exportPayload.columns).toContain('orderNumber');
  });

  it('displays history jobs list with status badge and download button', async () => {
    const user = userEvent.setup();

    mockFetch({
      'GET /api/v1/exports/resources': () => json(200, { data: MOCK_RESOURCES }),
      'GET /api/v1/exports/presets': () => json(200, { data: [] }),
      'GET /api/v1/exports/jobs': () => json(200, { data: MOCK_JOBS }),
      'GET /api/v1/exports/jobs/job-101/download': () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="orders_20261018.xlsx"',
          },
        }),
    });

    renderWithClient(<ExportDialog open={true} onOpenChange={() => {}} resource="orders" />);

    // Switch to History tab
    const historyTab = await screen.findByRole('button', { name: /export history/i });
    await user.click(historyTab);

    // Verify job row appears
    expect(await screen.findByText('orders_20261018.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/25 rows/i)).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();

    // Verify download button exists
    const downloadBtn = screen.getByRole('button', { name: /download/i });
    expect(downloadBtn).toBeInTheDocument();
  });
});
