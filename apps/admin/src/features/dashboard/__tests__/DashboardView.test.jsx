import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { DashboardView } from '../pages/DashboardView';

const MOCK_BRANCHES = [
  { id: 'br-1', code: 'MAIN', name: { en: 'Main Store' } },
  { id: 'br-2', code: 'RUH-01', name: { en: 'Riyadh Branch' } },
];

const MOCK_DASHBOARD_DATA = {
  period: {
    range: '7d',
    groupBy: 'day',
    start: '2026-10-11T00:00:00.000Z',
    end: '2026-10-18T12:00:00.000Z',
  },
  kpis: {
    totalSales: { current: 1500000, previous: 1000000, changePercent: 50 },
    netSales: { current: 1304348, previous: 869565, changePercent: 50 },
    ordersCount: { current: 42, previous: 30, changePercent: 40 },
    averageOrderValue: { current: 35714, previous: 33333, changePercent: 7.1 },
    itemsSold: { current: 98, previous: 70, changePercent: 40 },
    newCustomers: { current: 15, previous: 10, changePercent: 50 },
    returns: {
      returnsCount: { current: 4, previous: 2, changePercent: 100 },
      exchangesCount: { current: 2, previous: 1, changePercent: 100 },
      totalCount: { current: 6, previous: 3, changePercent: 100 },
      refundAmount: { current: 18000, previous: 9000, changePercent: 100 },
      differenceDue: { current: 2000, previous: 1000, changePercent: 100 },
      returnedUnits: { current: 8, previous: 4, changePercent: 100 },
      returnRate: { current: 14.3, previous: 10, changePercent: 43 },
    },
    inventory: { lowStockCount: 3, outOfStockCount: 1 },
  },
  salesOverTime: [
    {
      date: '2026-10-11',
      revenue: 200000,
      net: 173913,
      orders: 6,
      posRevenue: 150000,
      onlineRevenue: 50000,
      posOrders: 4,
      onlineOrders: 2,
    },
    {
      date: '2026-10-12',
      revenue: 300000,
      net: 260870,
      orders: 8,
      posRevenue: 200000,
      onlineRevenue: 100000,
      posOrders: 5,
      onlineOrders: 3,
    },
  ],
  channelBreakdown: {
    pos: { orders: 28, revenue: 1000000 },
    online: { orders: 14, revenue: 500000 },
  },
  topProducts: [
    {
      productId: 'p-1',
      sku: 'SKU-SHIRT',
      name: 'Cotton Polo Shirt',
      qty: 24,
      revenue: 240000,
      imageUrl: null,
    },
    {
      productId: 'p-2',
      sku: 'SKU-MUG',
      name: 'Ceramic Coffee Mug',
      qty: 18,
      revenue: 90000,
      imageUrl: null,
    },
  ],
  recentOrders: [
    {
      id: 'ord-101',
      orderNo: 'POS-000101',
      channel: 'pos',
      status: 'completed',
      customerName: 'Khalid Al-Mansour',
      total: 35000,
      placedAt: '2026-10-18T10:30:00.000Z',
      branchId: 'br-1',
    },
  ],
  paymentMethods: [
    { method: 'cash', methodType: 'offline', label: 'Cash', count: 25, total: 800000 },
    { method: 'card', methodType: 'gateway', label: 'Mada / Visa', count: 17, total: 700000 },
  ],
  returnsOverview: {
    summary: {
      returnsCount: 4,
      exchangesCount: 2,
      totalCount: 6,
      refundAmount: 18000,
      differenceDue: 2000,
      returnedUnits: 8,
      exchangedUnits: 2,
      returnRate: 14.3,
    },
    byChannel: {
      pos: { returnsCount: 3, exchangesCount: 1, refundAmount: 12000 },
      online: { returnsCount: 1, exchangesCount: 1, refundAmount: 6000 },
    },
    recentReturns: [
      {
        id: 'ret-101',
        returnNo: 'RET-000101',
        orderNo: 'POS-000102',
        type: 'return',
        channel: 'pos',
        customerName: 'Khalid Al-Mansour',
        refundAmount: 12000,
        differenceDue: 0,
        returnedUnits: 4,
      },
    ],
  },
};

function setupAuth() {
  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'token-123',
    profile: { name: 'Store Manager' },
    access: {
      isSuperAdmin: true,
      permissions: ['dashboard.view'],
      can: (p) => p === 'dashboard.view',
      assert: () => true,
      scope: { allBranches: true, branchIds: [] },
    },
  });
}

function renderDashboard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardView Admin UI (P8.1)', () => {
  beforeEach(() => {
    setupAuth();
  });

  it('renders KPI metrics and inventory alert badges', async () => {
    mockFetch({
      'GET /api/v1/analytics/dashboard': json(200, { data: MOCK_DASHBOARD_DATA }),
      'GET /api/v1/inventory/branches': json(200, { data: MOCK_BRANCHES }),
    });

    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: /Welcome, Store Manager/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Total sales')).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument(); // orders count
    const deltas = await screen.findAllByText('+50%');
    expect(deltas.length).toBeGreaterThanOrEqual(1);

    // Inventory health alerts
    expect(screen.getByText('Low stock alert')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders sales chart, channel breakdown, top products, and recent orders', async () => {
    mockFetch({
      'GET /api/v1/analytics/dashboard': json(200, { data: MOCK_DASHBOARD_DATA }),
      'GET /api/v1/inventory/branches': json(200, { data: MOCK_BRANCHES }),
    });

    renderDashboard();

    // Chart header & toggle buttons
    expect(await screen.findByText('Sales & orders trend')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();

    // Channel breakdown
    expect(screen.getByText('Sales by channel')).toBeInTheDocument();
    expect(screen.getByText(/67% of sales/)).toBeInTheDocument(); // POS share (10000 / 15000 = 67%)

    // Top products
    expect(screen.getByText('Top selling products')).toBeInTheDocument();
    expect(screen.getByText('Cotton Polo Shirt')).toBeInTheDocument();
    expect(screen.getByText('SKU-SHIRT')).toBeInTheDocument();

    // Recent orders
    expect(screen.getByText('Recent orders')).toBeInTheDocument();
    expect(screen.getByText('POS-000101')).toBeInTheDocument();
    expect(screen.getByText('Khalid Al-Mansour')).toBeInTheDocument();

    // Returns & exchanges card
    expect(screen.getAllByText('Returns & Exchanges').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('View Returns Report')).toBeInTheDocument();
    expect(screen.getByText('POS Till')).toBeInTheDocument();
    expect(screen.getByText('Online Store')).toBeInTheDocument();
    expect(screen.getByText('RET-000101')).toBeInTheDocument();
  });

  it('supports date range selection and branch filtering', async () => {
    const m = mockFetch({
      'GET /api/v1/analytics/dashboard': json(200, { data: MOCK_DASHBOARD_DATA }),
      'GET /api/v1/inventory/branches': json(200, { data: MOCK_BRANCHES }),
    });

    renderDashboard();

    expect(await screen.findByText('Sales & orders trend')).toBeInTheDocument();

    // Switch range to 'Today'
    const todayBtn = screen.getByRole('button', { name: 'Today' });
    await userEvent.click(todayBtn);

    await waitFor(() => {
      const calls = m.calls.filter((c) => c.key === 'GET /api/v1/analytics/dashboard');
      expect(calls.some((c) => c.url.searchParams.get('range') === 'today')).toBe(true);
    });

    // Select specific branch
    const branchSelect = screen.getByLabelText('All branches');
    await userEvent.selectOptions(branchSelect, 'br-1');

    await waitFor(() => {
      const calls = m.calls.filter((c) => c.key === 'GET /api/v1/analytics/dashboard');
      expect(calls.some((c) => c.url.searchParams.get('branchId') === 'br-1')).toBe(true);
    });
  });
});
