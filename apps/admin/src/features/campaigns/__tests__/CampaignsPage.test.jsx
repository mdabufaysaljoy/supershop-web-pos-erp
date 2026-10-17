import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { CampaignEditorPage } from '../pages/CampaignEditorPage';
import { CampaignsPage } from '../pages/CampaignsPage';

const CAMPAIGN_ROW = {
  id: 'cmp-1',
  name: 'National Day Offer',
  channel: 'email',
  segment: 'vip',
  status: 'draft',
  subject: { en: 'Saudi National Day Special' },
  message: { en: 'Celebrate with 50% discount!' },
  scheduledAt: null,
  completedAt: null,
  stats: { targeted: 15, sent: 0, failed: 0, skipped: 0 },
  createdAt: '2026-09-20T10:00:00.000Z',
};

const CAMPAIGN_DETAIL = {
  ...CAMPAIGN_ROW,
  updatedAt: '2026-09-20T10:00:00.000Z',
};

function setupAuth(permissions = ['campaign.view', 'campaign.manage', 'campaign.send']) {
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
}

function renderWithProviders(ui, { route = '/campaigns' } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Campaigns Admin UI (P7.3)', () => {
  beforeEach(() => {
    setupAuth();
  });

  it('renders campaigns table with status and channel badges', async () => {
    mockFetch({
      'GET /api/v1/campaigns': json(200, {
        data: [CAMPAIGN_ROW],
        meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
      }),
    });

    renderWithProviders(<CampaignsPage />);

    expect(await screen.findByText('National Day Offer')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders campaign editor and allows inserting variable tags', async () => {
    const user = userEvent.setup();

    mockFetch({
      'GET /api/v1/campaigns/audience-count': json(200, { data: { count: 42 } }),
      'GET /api/v1/campaigns/cmp-1': json(200, { data: CAMPAIGN_DETAIL }),
      'GET /api/v1/campaigns/cmp-1/deliveries': json(200, { data: [], meta: { total: 0 } }),
    });

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/new" element={<CampaignEditorPage />} />
      </Routes>,
      { route: '/campaigns/new' },
    );

    expect(await screen.findByText('Create Campaign')).toBeInTheDocument();
    expect(screen.getByLabelText(/Campaign name/i)).toBeInTheDocument();

    // Check audience preview is shown
    expect(await screen.findByText(/Targeting 42 opted-in customers/i)).toBeInTheDocument();

    // Click variable button to insert tag
    const varBtn = screen.getByRole('button', { name: '{{customer.name}}' });
    await user.click(varBtn);

    const textarea = screen.getByLabelText(/Message body/i);
    expect(textarea.value).toContain('{{customer.name}}');
  });

  it('renders existing campaign details with stats and test dispatch panel', async () => {
    mockFetch({
      'GET /api/v1/campaigns/cmp-1': json(200, { data: CAMPAIGN_DETAIL }),
      'GET /api/v1/campaigns/audience-count': json(200, { data: { count: 15 } }),
      'GET /api/v1/campaigns/cmp-1/deliveries': json(200, { data: [], meta: { total: 0 } }),
    });

    renderWithProviders(
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignEditorPage />} />
      </Routes>,
      { route: '/campaigns/cmp-1' },
    );

    expect(await screen.findByText('National Day Offer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Saudi National Day Special')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Celebrate with 50% discount!')).toBeInTheDocument();
    expect(screen.getByText('Send Test Message')).toBeInTheDocument();
  });
});
