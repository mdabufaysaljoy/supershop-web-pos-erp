import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { CustomerDetailPage } from '../pages/CustomerDetailPage';
import { CustomersPage } from '../pages/CustomersPage';

const CUSTOMER_LIST_ROW = {
  id: 'c1',
  name: 'Lina Al-Mansour',
  email: 'lina@example.test',
  emailVerified: true,
  phone: '+966501112233',
  status: 'active',
  lang: 'en',
  createdAt: '2026-09-01T10:00:00.000Z',
  orderCount: 4,
  lifetimeSpend: 250_000,
  lastOrderAt: '2026-10-15T14:30:00.000Z',
  loyaltyPoints: 120,
  loyaltyTier: 'gold',
  segment: 'vip',
};

const CUSTOMER_DETAIL = {
  id: 'c1',
  name: 'Lina Al-Mansour',
  email: 'lina@example.test',
  emailVerified: true,
  phone: '+966501112233',
  status: 'active',
  lang: 'en',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-15T14:30:00.000Z',
  addresses: [
    {
      _id: 'a1',
      label: 'Home',
      isDefault: true,
      address: {
        line1: 'King Fahd Rd 45',
        district: 'Al-Olaya',
        city: 'Riyadh',
        postalCode: '12211',
      },
    },
  ],
  stats: {
    orderCount: 4,
    lifetimeSpend: 250_000,
    averageOrderValue: 62_500,
    lastOrderAt: '2026-10-15T14:30:00.000Z',
    segment: 'vip',
  },
  loyalty: {
    account: {
      pointsBalance: 120,
      lifetimeEarned: 150,
      lifetimeRedeemed: 30,
      tier: 'gold',
      status: 'active',
    },
    recentLedger: [
      {
        id: 'tx1',
        type: 'earn',
        points: 25,
        balanceAfter: 120,
        source: { type: 'order', docNo: 'ORD-000007' },
        reason: 'Earned for order ORD-000007',
        createdAt: '2026-10-15T14:30:00.000Z',
      },
    ],
  },
  recentOrders: [
    {
      id: 'o1',
      orderNo: 'ORD-000007',
      channel: 'online',
      status: 'completed',
      itemCount: 2,
      total: 62_500,
      deliveryMethod: 'delivery',
      placedAt: '2026-10-15T14:30:00.000Z',
    },
  ],
};

const SEGMENTS_SUMMARY = {
  all: 1,
  vip: 1,
  loyal: 0,
  active: 0,
  new: 0,
  slipping: 0,
  churn_risk: 0,
  idle: 0,
};

function setup(
  ui,
  {
    permissions = ['customer.view', 'customer.manage'],
    path = '/customers',
    detail = CUSTOMER_DETAIL,
  } = {},
) {
  let current = structuredClone(detail);
  const update = (patch) => {
    current = { ...current, ...patch };
    return json(200, { data: current });
  };

  useAuthStore.setState({
    status: 'authenticated',
    accessToken: 'token-123',
    profile: { name: 'Admin Staff' },
    access: {
      isSuperAdmin: true,
      permissions,
      can: (p) => permissions.includes(p),
      assert: (p) => permissions.includes(p),
      scope: { allBranches: true, branchIds: [] },
    },
  });

  const m = mockFetch({
    'GET /api/v1/customers': json(200, {
      data: [CUSTOMER_LIST_ROW],
      meta: { total: 1, page: 1, limit: 25 },
    }),
    'GET /api/v1/customers/segments': json(200, { data: SEGMENTS_SUMMARY }),
    'GET /api/v1/customers/c1': () => json(200, { data: current }),
    'GET /api/v1/settings': json(200, { data: [] }),
    'POST /api/v1/loyalty/customers/c1/issue-card': ({ init }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      const cardNumber = body.cardNumber || 'LC99887766';
      current.loyalty.account.cardNumber = cardNumber;
      current.loyalty.account.cardIssuedAt = new Date().toISOString();
      current.loyalty.account.cardFeeHalalas = body.feeHalalas || 0;
      return json(201, {
        data: {
          id: 'acc1',
          customerId: 'c1',
          cardNumber,
          pointsBalance: 120,
          tier: 'gold',
          cardFeeHalalas: body.feeHalalas || 0,
        },
      });
    },
    'PATCH /api/v1/customers/c1': ({ init }) => {
      const body = JSON.parse(init.body);
      return update(body);
    },
  });

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/customers" element={ui} />
          <Route path="/customers/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return m;
}

describe('CustomersPage', () => {
  beforeEach(() => {
    window.scrollTo = () => {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders customer list with segments, spend, points and tier', async () => {
    setup(<CustomersPage />, { path: '/customers' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Customers');

    await waitFor(() => {
      expect(screen.getByText('Lina Al-Mansour')).toBeInTheDocument();
    });

    expect(screen.getAllByText('VIP').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('+966501112233')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
  });

  it('renders customer detail page with KPIs, orders, and loyalty ledger', async () => {
    setup(<CustomerDetailPage />, { path: '/customers/c1' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lina Al-Mansour');
    });

    // KPI cards
    expect(screen.getByText('Lifetime spend')).toBeInTheDocument();
    expect(screen.getByText('Total orders')).toBeInTheDocument();
    expect(screen.getByText('Points balance')).toBeInTheDocument();

    // Recent orders
    expect(screen.getByText('ORD-000007')).toBeInTheDocument();

    // Loyalty ledger
    expect(screen.getByText('+25')).toBeInTheDocument();
    expect(screen.getByText('Earned for order ORD-000007')).toBeInTheDocument();

    // Saved address
    expect(screen.getByText(/King Fahd Rd 45/)).toBeInTheDocument();
  });

  it('opens edit customer dialog and submits update', async () => {
    const user = userEvent.setup();
    setup(<CustomerDetailPage />, { path: '/customers/c1' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lina Al-Mansour');
    });

    const editBtn = screen.getByRole('button', { name: /Edit customer/i });
    await user.click(editBtn);

    expect(screen.getByText('Edit customer details')).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: /Save changes/i });
    await user.click(saveBtn);
  });

  it('allows issuing a loyalty card and viewing the printable card label', async () => {
    const user = userEvent.setup();
    setup(<CustomerDetailPage />, { path: '/customers/c1' });

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lina Al-Mansour');
    });

    // Check loyalty card section
    expect(screen.getByText('Loyalty Card')).toBeInTheDocument();
    expect(screen.getByText('No loyalty card issued for this customer yet.')).toBeInTheDocument();

    const issueBtn = screen.getByRole('button', { name: /Issue Loyalty Card/i });
    await user.click(issueBtn);

    expect(screen.getByRole('heading', { name: 'Issue Loyalty Card' })).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /Issue Card & View Label/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Customer Loyalty Card' })).toBeInTheDocument();
      expect(screen.getAllByText('Print Label').length).toBeGreaterThanOrEqual(1);
    });
  });
});
