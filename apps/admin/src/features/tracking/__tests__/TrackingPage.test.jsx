import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/store';
import { json, mockFetch } from '@/test/fetchMock';
import { TrackingPage } from '../pages/TrackingPage';

const MOCK_INTEGRATIONS = [
  {
    provider: 'gtm',
    enabled: true,
    clientConfig: { containerId: 'GTM-TEST123', serverUrl: '' },
    credentials: {},
    events: ['page_view', 'purchase'],
    updatedAt: new Date().toISOString(),
  },
  {
    provider: 'ga4',
    enabled: false,
    clientConfig: { measurementId: '' },
    credentials: { apiSecret: '••••••123' },
    events: [],
    updatedAt: null,
  },
  {
    provider: 'meta',
    enabled: true,
    clientConfig: { pixelId: '1234567890' },
    credentials: { capiToken: '••••••••xyz' },
    events: ['page_view', 'add_to_cart', 'purchase'],
    updatedAt: new Date().toISOString(),
  },
  {
    provider: 'google_ads',
    enabled: false,
    clientConfig: { conversionId: '', conversionLabel: '' },
    credentials: {},
    events: [],
    updatedAt: null,
  },
  {
    provider: 'tiktok',
    enabled: false,
    clientConfig: { pixelId: '' },
    credentials: {},
    events: [],
    updatedAt: null,
  },
  {
    provider: 'snapchat',
    enabled: false,
    clientConfig: { pixelId: '' },
    credentials: {},
    events: [],
    updatedAt: null,
  },
];

const MOCK_CONSENT = {
  enabled: true,
  defaultAnalytics: false,
  defaultMarketing: false,
  consentModeV2: true,
  privacyPolicyUrl: '/privacy',
};

function renderTrackingPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TrackingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TrackingPage Admin UI (P9.1)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'authenticated',
      accessToken: 'test-token',
      profile: { name: 'Marketing Admin' },
      access: {
        isSuperAdmin: true,
        permissions: ['tracking.manage'],
        can: (p) => p === 'tracking.manage',
        assert: () => true,
        scope: { allBranches: true, branchIds: [] },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders tracking page title, provider cards, and active badges', async () => {
    mockFetch({
      'GET /api/v1/tracking': json(200, {
        data: {
          integrations: MOCK_INTEGRATIONS,
          consent: MOCK_CONSENT,
        },
      }),
    });

    renderTrackingPage();

    expect(
      await screen.findByRole('heading', { name: /Marketing Tracking & Integrations/i }),
    ).toBeInTheDocument();

    // Verify Provider names are rendered
    expect(await screen.findByText('Google Tag Manager')).toBeInTheDocument();
    expect(screen.getByText('Google Analytics 4')).toBeInTheDocument();
    expect(screen.getByText('Meta Pixel & Conversions API')).toBeInTheDocument();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();
    expect(screen.getByText('TikTok Pixel')).toBeInTheDocument();
    expect(screen.getByText('Snapchat Pixel')).toBeInTheDocument();

    // GTM Container ID prefilled
    const gtmInput = screen.getByPlaceholderText('GTM-XXXXXXX');
    expect(gtmInput).toHaveValue('GTM-TEST123');
  });

  it('submits updated provider integration config on save', async () => {
    const user = userEvent.setup();
    let updatedPayload = null;

    mockFetch({
      'GET /api/v1/tracking': json(200, {
        data: {
          integrations: MOCK_INTEGRATIONS,
          consent: MOCK_CONSENT,
        },
      }),
      'PUT /api/v1/tracking/gtm': ({ init }) => {
        updatedPayload = JSON.parse(init.body);
        return json(200, {
          data: {
            provider: 'gtm',
            ...updatedPayload,
            updatedAt: new Date().toISOString(),
          },
        });
      },
    });

    renderTrackingPage();

    await screen.findByRole('heading', { name: /Marketing Tracking & Integrations/i });

    // Find GTM card container input and edit it
    const gtmInput = await screen.findByPlaceholderText('GTM-XXXXXXX');
    await user.clear(gtmInput);
    await user.type(gtmInput, 'GTM-NEW777');

    // Find and click the first Save Changes button (for GTM card)
    const saveButtons = screen.getAllByRole('button', { name: /Save Changes/i });
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(updatedPayload).toBeTruthy();
    });

    expect(updatedPayload.clientConfig.containerId).toBe('GTM-NEW777');
    expect(updatedPayload.enabled).toBe(true);
  });

  it('switches to PDPL Consent Banner tab and updates settings', async () => {
    const user = userEvent.setup();
    let updatedConsent = null;

    mockFetch({
      'GET /api/v1/tracking': json(200, {
        data: {
          integrations: MOCK_INTEGRATIONS,
          consent: MOCK_CONSENT,
        },
      }),
      'PUT /api/v1/tracking/settings/consent': ({ init }) => {
        updatedConsent = JSON.parse(init.body);
        return json(200, { data: updatedConsent });
      },
    });

    renderTrackingPage();

    await screen.findByRole('heading', { name: /Marketing Tracking & Integrations/i });

    // Switch to PDPL Consent Banner tab
    const consentTab = screen.getByRole('button', { name: /PDPL Consent Banner/i });
    await user.click(consentTab);

    // Verify Consent Banner title and fields
    expect(await screen.findByText('Google Consent Mode v2')).toBeInTheDocument();
    expect(screen.getByText('Strictly Necessary')).toBeInTheDocument();
    expect(screen.getByText('Analytics Storage')).toBeInTheDocument();
    expect(screen.getByText('Marketing & Ads')).toBeInTheDocument();

    // Edit Privacy Policy URL
    const privacyInput = screen.getByPlaceholderText('/privacy');
    await user.clear(privacyInput);
    await user.type(privacyInput, '/legal/privacy-policy');

    // Save Consent Settings
    const saveConsentBtn = screen.getByRole('button', { name: /Save Consent Settings/i });
    await user.click(saveConsentBtn);

    await waitFor(() => {
      expect(updatedConsent).toBeTruthy();
    });

    expect(updatedConsent.privacyPolicyUrl).toBe('/legal/privacy-policy');
  });
});
