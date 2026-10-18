import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { ReportsPage } from '../pages/ReportsPage';

const MOCK_BRANCHES = [
  { id: 'br-1', code: 'MAIN', name: { en: 'Main Store' } },
  { id: 'br-2', code: 'RUH-01', name: { en: 'Riyadh Branch' } },
];

const MOCK_PERFORMANCE_DATA = {
  dimension: 'product',
  range: '7d',
  period: {
    start: '2026-10-11T00:00:00.000Z',
    end: '2026-10-18T12:00:00.000Z',
  },
  summary: {
    totalRevenue: 500000,
    totalNet: 434783,
    totalOrders: 15,
    totalUnits: 40,
    averageOrderValue: 33333,
    totalProfit: 234783,
    overallMargin: 54.0,
  },
  items: [
    {
      rank: 1,
      id: 'p-1',
      name: 'Cold Brew Blend',
      sku: 'CB-001',
      ordersCount: 10,
      quantity: 25,
      revenue: 300000,
      net: 260870,
      sharePercent: 60.0,
      cost: 100000,
      profit: 160870,
      marginPercent: 61.7,
    },
    {
      rank: 2,
      id: 'p-2',
      name: 'Espresso Roast',
      sku: 'ER-002',
      ordersCount: 5,
      quantity: 15,
      revenue: 200000,
      net: 173913,
      sharePercent: 40.0,
      cost: 100000,
      profit: 73913,
      marginPercent: 42.5,
    },
  ],
  chart: [
    { name: 'Cold Brew Blend', revenue: 300000, quantity: 25, sharePercent: 60 },
    { name: 'Espresso Roast', revenue: 200000, quantity: 15, sharePercent: 40 },
  ],
};

function setupAuth() {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'test-token',
    profile: { name: 'Admin Staff' },
    access: {
      isSuperAdmin: true,
      permissions: ['report.view', 'product.viewCost', 'inventory.view'],
      can: (p) => ['report.view', 'product.viewCost', 'inventory.view'].includes(p),
      assert: () => true,
      scope: { allBranches: true, branchIds: [] },
    },
  });
}

function renderReportsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MOCK_SALES_FORECAST = {
  strategy: {
    name: 'moving_average',
    label: 'Simple Moving Average',
    description: 'Projects daily sales based on historical average rate',
  },
  availableStrategies: [
    { name: 'moving_average', label: 'Simple Moving Average' },
    { name: 'seasonality', label: 'Day-of-Week Seasonality' },
  ],
  horizon: '14d',
  horizonDays: 14,
  lookback: '30d',
  lookbackDays: 30,
  historical: [
    { date: '2026-10-16', quantity: 10, revenue: 100000, orders: 2 },
    { date: '2026-10-17', quantity: 15, revenue: 150000, orders: 3 },
  ],
  forecast: [
    {
      date: '2026-10-18',
      quantity: 12.5,
      revenue: 125000,
      lowerQuantity: 8,
      upperQuantity: 17,
      lowerRevenue: 80000,
      upperRevenue: 170000,
    },
  ],
  summary: {
    historicalTotalUnits: 25,
    historicalTotalRevenue: 250000,
    historicalDailyAvgUnits: 12.5,
    historicalDailyAvgRevenue: 125000,
    forecastTotalUnits: 175,
    forecastTotalRevenue: 1750000,
    forecastDailyAvgUnits: 12.5,
    forecastDailyAvgRevenue: 125000,
    projectedGrowthPercent: 0,
  },
};

const MOCK_STOCKOUT_FORECAST = {
  summary: {
    totalTracked: 2,
    outOfStockCount: 1,
    criticalCount: 1,
    warningCount: 0,
    healthyCount: 0,
    totalRecommendedReorderUnits: 50,
  },
  items: [
    {
      variantId: 'v-1',
      productId: 'p-1',
      sku: 'OUT-001',
      productName: 'Out of Stock Product',
      variantLabel: 'Size: M',
      branchId: 'br-1',
      branchName: 'Main Store',
      onHand: 0,
      dailyVelocity: 2.0,
      daysRemaining: 0,
      estimatedStockoutDate: '2026-10-18T00:00:00.000Z',
      riskLevel: 'out_of_stock',
      recommendedReorderQty: 40,
    },
    {
      variantId: 'v-2',
      productId: 'p-2',
      sku: 'CRIT-002',
      productName: 'Critical Product',
      variantLabel: 'Color: Red',
      branchId: 'br-1',
      branchName: 'Main Store',
      onHand: 4,
      dailyVelocity: 2.0,
      daysRemaining: 2,
      estimatedStockoutDate: '2026-10-20T00:00:00.000Z',
      riskLevel: 'critical',
      recommendedReorderQty: 10,
    },
  ],
  pagination: {
    total: 2,
    page: 1,
    limit: 50,
    pages: 1,
  },
  filters: {
    lookback: '30d',
    risk: 'all',
  },
};

describe('ReportsPage Admin UI (P8.2, P8.3)', () => {
  beforeEach(() => {
    setupAuth();

    mockFetch({
      'GET /api/v1/inventory/branches': json(200, { data: MOCK_BRANCHES }),
      'GET /api/v1/analytics/performance': json(200, { data: MOCK_PERFORMANCE_DATA }),
      'GET /api/v1/analytics/forecast/sales': json(200, { data: MOCK_SALES_FORECAST }),
      'GET /api/v1/analytics/forecast/stockout': json(200, { data: MOCK_STOCKOUT_FORECAST }),
      'GET /api/v1/exports/resources': json(200, {
        data: {
          orders: [
            {
              key: 'orderNumber',
              label: 'Order Number',
              type: 'string',
              default: true,
              permitted: true,
            },
          ],
        },
      }),
      'GET /api/v1/exports/presets': json(200, { data: [] }),
      'GET /api/v1/exports/jobs': json(200, { data: [] }),
    });
  });

  it('renders summary KPIs, top chart, and performance table with profit margins', async () => {
    renderReportsPage();

    // Title and subtitle
    expect(
      await screen.findByRole('heading', { name: /Performance Reports/i }),
    ).toBeInTheDocument();

    // Summary KPIs
    expect(await screen.findByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getAllByText('Net Sales').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Units Sold')).toBeInTheDocument();
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    expect(screen.getByText('Total Profit')).toBeInTheDocument();

    // Items in table
    expect(screen.getByText('Cold Brew Blend')).toBeInTheDocument();
    expect(screen.getByText('CB-001')).toBeInTheDocument();
    expect(screen.getByText('Espresso Roast')).toBeInTheDocument();
    expect(screen.getByText('ER-002')).toBeInTheDocument();

    // Table share badges
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();

    // Margin percentages
    expect(screen.getByText('61.7%')).toBeInTheDocument();
    expect(screen.getByText('42.5%')).toBeInTheDocument();
  });

  it('supports dimension switching, date range selection, and branch filtering', async () => {
    const user = userEvent.setup();
    renderReportsPage();

    await screen.findByRole('heading', { name: /Performance Reports/i });

    // Dimension tabs
    const staffTab = screen.getByRole('button', { name: /Staff/i });
    const categoryTab = screen.getByRole('button', { name: /Category/i });
    const brandTab = screen.getByRole('button', { name: /Brand/i });
    const branchTab = screen.getByRole('button', { name: /Branch/i });
    const channelTab = screen.getByRole('button', { name: /Channel/i });

    expect(staffTab).toBeInTheDocument();
    expect(categoryTab).toBeInTheDocument();
    expect(brandTab).toBeInTheDocument();
    expect(branchTab).toBeInTheDocument();
    expect(channelTab).toBeInTheDocument();

    // Click Staff tab
    await user.click(staffTab);

    // Range selector: click 30d
    const range30d = screen.getByRole('button', { name: /Last 30 days/i });
    await user.click(range30d);

    // Branch selector
    const branchSelect = screen.getByLabelText(/All branches/i);
    await waitFor(() => expect(screen.getByText('Main Store')).toBeInTheDocument());
    await user.selectOptions(branchSelect, 'br-1');
    expect(branchSelect.value).toBe('br-1');

    // Export button
    const exportBtn = screen.getByRole('button', { name: /Export CSV/i });
    expect(exportBtn).toBeInTheDocument();
  });

  it('switches to Forecast & Stock-out tab, renders sales projections and stockout table', async () => {
    const user = userEvent.setup();
    renderReportsPage();

    await screen.findByRole('heading', { name: /Performance Reports/i });

    // Click Forecast & Stock-out tab
    const forecastTab = screen.getByRole('button', { name: /Forecast & Stock-out/i });
    expect(forecastTab).toBeInTheDocument();
    await user.click(forecastTab);

    // Verify Strategy Pills
    expect(await screen.findByText('Simple Moving Average')).toBeInTheDocument();
    expect(screen.getByText('Day-of-Week Seasonality')).toBeInTheDocument();

    // Verify KPI Cards
    expect(screen.getByText(/Projected Revenue/i)).toBeInTheDocument();
    expect(screen.getByText(/Projected Units/i)).toBeInTheDocument();

    // Verify Stockout Table Items
    expect(await screen.findByText('Out of Stock Product')).toBeInTheDocument();
    expect(screen.getByText('OUT-001')).toBeInTheDocument();
    expect(screen.getByText('Critical Product')).toBeInTheDocument();
    expect(screen.getByText('CRIT-002')).toBeInTheDocument();

    // Verify Stockout Risk Badges
    expect(screen.getAllByText(/Out of Stock/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Critical/i).length).toBeGreaterThanOrEqual(1);

    // Verify replenishment recommendation badge
    expect(screen.getByText('+40')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
  });

  it('switches to Report Builder tab and displays dataset selectors and column configurations', async () => {
    const user = userEvent.setup();
    renderReportsPage();

    await screen.findByRole('heading', { name: /Performance Reports/i });

    const builderTab = screen.getByRole('button', { name: /Report Builder/i });
    expect(builderTab).toBeInTheDocument();
    await user.click(builderTab);

    expect(await screen.findByText(/Report Builder Studio/i)).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
    expect(screen.getByText('Order Number')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate & Export/i })).toBeInTheDocument();
  });
});
