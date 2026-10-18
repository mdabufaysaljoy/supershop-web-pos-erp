// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/i18n/dictionaries/en.json';
import { I18nProvider } from '@/i18n/I18nProvider';
import { pickNamespaces } from '@/i18n/translate';
import { ConsentBanner } from '@/components/tracking/ConsentBanner';
import { TrackingProvider, useTracking } from '@/components/tracking/TrackingProvider';
import {
  captureAttribution,
  clearAttribution,
  ensureGtag,
  getAttributionPayload,
  getStoredConsent,
  initConsentMode,
  parseMarketingParams,
  saveConsent,
  trackAddToCart,
  trackPageView,
  trackPurchase,
  trackViewItem,
} from '@/lib/tracking';

vi.mock('next/navigation', () => ({
  usePathname: () => '/products/test-item',
  useSearchParams: () => new URLSearchParams('utm_source=google&utm_medium=cpc&gclid=testgclid123'),
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithI18n(ui) {
  return render(
    <I18nProvider lang="en" dict={pickNamespaces(en)}>
      {ui}
    </I18nProvider>,
  );
}

describe('Storefront Marketing Tracking (P9.1)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.dataLayer = [];
    delete window.gtag;
    delete window.fbq;
    delete window._fbq;
    document.cookie = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UTM & Click-ID Capture', () => {
    it('parses UTM and click ID query parameters from search string', () => {
      const search =
        '?utm_source=facebook&utm_medium=social&utm_campaign=summer_sale&utm_term=shoes&utm_content=ad1&fbclid=fb123&gclid=g123&ttclid=tt123&sclid=sc123';
      const parsed = parseMarketingParams(search);

      expect(parsed).toEqual({
        utmSource: 'facebook',
        utmMedium: 'social',
        utmCampaign: 'summer_sale',
        utmTerm: 'shoes',
        utmContent: 'ad1',
        fbclid: 'fb123',
        gclid: 'g123',
        ttclid: 'tt123',
        sclid: 'sc123',
      });
    });

    it('captures attribution into sessionStorage and sets _fbc cookie if fbclid present', () => {
      const captured = captureAttribution(
        new URLSearchParams('utm_source=newsletter&utm_medium=email&fbclid=fbclick999'),
      );

      expect(captured.utmSource).toBe('newsletter');
      expect(captured.fbclid).toBe('fbclick999');

      // Check sessionStorage
      const rawStored = window.sessionStorage.getItem('supershop_attribution');
      expect(rawStored).toBeTruthy();
      expect(JSON.parse(rawStored).utmSource).toBe('newsletter');

      // Check _fbc cookie was formatted
      expect(document.cookie).toContain('_fbc=fb.1.');
    });

    it('returns attribution payload matching schema when marketing data exists', () => {
      captureAttribution(new URLSearchParams('utm_source=google&gclid=gclid456'));

      const payload = getAttributionPayload();
      expect(payload).toBeTruthy();
      expect(payload.utmSource).toBe('google');
      expect(payload.gclid).toBe('gclid456');
      expect(payload.clientUserAgent).toBeTruthy();

      clearAttribution();
      expect(getAttributionPayload()).toBeUndefined();
    });
  });

  describe('PDPL Consent Management & Google Consent Mode v2', () => {
    it('initializes Google Consent Mode v2 with default denied parameters', () => {
      initConsentMode({
        consentModeV2: true,
        defaultAnalytics: false,
        defaultMarketing: false,
      });

      expect(window.dataLayer).toBeTruthy();
      expect(window.dataLayer.length).toBeGreaterThan(0);

      // Check arguments passed to gtag
      const consentDefaultCall = window.dataLayer.find(
        (args) => args[0] === 'consent' && args[1] === 'default',
      );
      expect(consentDefaultCall).toBeTruthy();
      expect(consentDefaultCall[2]).toMatchObject({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        wait_for_update: 500,
      });
    });

    it('saves user consent and updates Google Consent Mode v2 to granted', () => {
      ensureGtag();

      saveConsent({ analytics: true, marketing: true });

      const stored = getStoredConsent();
      expect(stored).toBeTruthy();
      expect(stored.analytics).toBe(true);
      expect(stored.marketing).toBe(true);
      expect(stored.necessary).toBe(true);

      const consentUpdateCall = window.dataLayer.find(
        (args) => args[0] === 'consent' && args[1] === 'update',
      );
      expect(consentUpdateCall).toBeTruthy();
      expect(consentUpdateCall[2]).toMatchObject({
        analytics_storage: 'granted',
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
      });
    });
  });

  describe('dataLayer Ecommerce Events with event_id', () => {
    it('pushes page_view and ecommerce events with unique event_id', () => {
      const pageEventId = trackPageView({ path: '/catalog/sale' });
      expect(pageEventId).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);

      const pageEntry = window.dataLayer.find((e) => e.event === 'page_view');
      expect(pageEntry).toBeTruthy();
      expect(pageEntry.event_id).toBe(pageEventId);
      expect(pageEntry.page_path).toBe('/catalog/sale');

      const itemEventId = trackViewItem({
        item: {
          item_id: 'item-1',
          item_name: 'Summer T-Shirt',
          price: 75,
        },
        currency: 'SAR',
      });
      expect(itemEventId).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);

      const viewItemEntry = window.dataLayer.find((e) => e.event === 'view_item');
      expect(viewItemEntry).toBeTruthy();
      expect(viewItemEntry.ecommerce.currency).toBe('SAR');
      expect(viewItemEntry.ecommerce.value).toBe(75);
      expect(viewItemEntry.ecommerce.items[0].item_name).toBe('Summer T-Shirt');
    });

    it('pushes add_to_cart and purchase events with items array and transaction_id', () => {
      trackAddToCart({
        item: { item_id: 'v10', item_name: 'Jeans', price: 120, quantity: 2 },
        currency: 'SAR',
      });

      const addEntry = window.dataLayer.find((e) => e.event === 'add_to_cart');
      expect(addEntry).toBeTruthy();
      expect(addEntry.ecommerce.value).toBe(2.4);

      const purchaseEventId = trackPurchase({
        orderNumber: 'ORD-9999',
        currency: 'SAR',
        value: 240,
        tax: 36,
        shipping: 15,
        items: [{ item_id: 'v10', item_name: 'Jeans', price: 120, quantity: 2 }],
      });

      const purchaseEntry = window.dataLayer.find((e) => e.event === 'purchase');
      expect(purchaseEntry).toBeTruthy();
      expect(purchaseEntry.ecommerce.transaction_id).toBe('ORD-9999');
      expect(purchaseEntry.ecommerce.tax).toBe(36);
      expect(purchaseEntry.event_id).toBe(purchaseEventId);
    });
  });

  describe('PDPL ConsentBanner Component', () => {
    it('renders consent banner and handles Accept All', async () => {
      const user = userEvent.setup();
      let savedConsent = null;

      renderWithI18n(
        <ConsentBanner
          config={{ enabled: true, privacyPolicyUrl: '/privacy' }}
          isOpen={true}
          onSave={(c) => {
            savedConsent = c;
          }}
        />,
      );

      expect(screen.getByRole('heading', { name: /We value your privacy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Accept All/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Necessary Only/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Customize Preferences/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Accept All/i }));

      expect(savedConsent).toEqual({ analytics: true, marketing: true });
    });

    it('handles Necessary Only decision', async () => {
      const user = userEvent.setup();
      let savedConsent = null;

      renderWithI18n(
        <ConsentBanner
          config={{ enabled: true }}
          isOpen={true}
          onSave={(c) => {
            savedConsent = c;
          }}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Necessary Only/i }));
      expect(savedConsent).toEqual({ analytics: false, marketing: false });
    });

    it('opens customize view and saves custom preferences', async () => {
      const user = userEvent.setup();
      let savedConsent = null;

      renderWithI18n(
        <ConsentBanner
          config={{ enabled: true, defaultAnalytics: false, defaultMarketing: false }}
          isOpen={true}
          onSave={(c) => {
            savedConsent = c;
          }}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Customize Preferences/i }));

      expect(screen.getByText(/Strictly Necessary/i)).toBeInTheDocument();
      const analyticsCheckbox = screen.getByLabelText(/Analytics & Performance/i);
      const marketingCheckbox = screen.getByLabelText(/Marketing & Advertising/i);

      expect(analyticsCheckbox).not.toBeChecked();
      expect(marketingCheckbox).not.toBeChecked();

      // Check Analytics only
      await user.click(analyticsCheckbox);
      expect(analyticsCheckbox).toBeChecked();

      await user.click(screen.getByRole('button', { name: /Save Preferences/i }));

      expect(savedConsent).toEqual({ analytics: true, marketing: false });
    });
  });

  describe('TrackingProvider Component', () => {
    function TestConsumer() {
      const { track, consent, getAttribution } = useTracking();
      return (
        <div>
          <button type="button" onClick={() => track('test_custom_event', { foo: 'bar' })}>
            Trigger Event
          </button>
          <div data-testid="consent-state">{JSON.stringify(consent)}</div>
          <div data-testid="attr-state">{JSON.stringify(getAttribution())}</div>
        </div>
      );
    }

    it('provides context and injects GTM container script when enabled', async () => {
      const mockInitialData = {
        integrations: [
          {
            provider: 'gtm',
            enabled: true,
            clientConfig: { containerId: 'GTM-STORE1' },
            events: ['page_view', 'purchase'],
          },
        ],
        consent: { enabled: true, consentModeV2: true },
      };

      renderWithI18n(
        <TrackingProvider initialData={mockInitialData}>
          <TestConsumer />
        </TrackingProvider>,
      );

      // Verify GTM script tag was appended
      await waitFor(() => {
        const gtmScript = document.getElementById('gtm-script-GTM-STORE1');
        expect(gtmScript).toBeTruthy();
        expect(gtmScript.src).toContain('id=GTM-STORE1');
      });

      // Verify context track method works
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Trigger Event/i }));

      const customEntry = window.dataLayer.find((e) => e.event === 'test_custom_event');
      expect(customEntry).toBeTruthy();
      expect(customEntry.foo).toBe('bar');
    });
  });
});
