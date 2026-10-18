import { describe, expect, it } from 'vitest';
import {
  attributionSchema,
  buildDataLayerPayload,
  buildEcomItem,
  consentSettingsSchema,
  generateEventId,
  updateTrackingIntegrationSchema,
  CONSENT_CATEGORIES,
  TRACKING_PROVIDERS,
} from '../schemas/tracking.js';
import { TRACKING_EVENTS } from '../trackingEvents.js';

describe('Tracking Schemas & Helpers (P9.1)', () => {
  it('generates unique event IDs with prefix', () => {
    const id1 = generateEventId('evt');
    const id2 = generateEventId('evt');

    expect(id1).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);
    expect(id2).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it('validates attribution UTMs and click-IDs', () => {
    const valid = {
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'winter_sale',
      utmTerm: 'coffee beans',
      utmContent: 'banner_top',
      gclid: 'Cj0KCQjw1234567890',
      fbclid: 'IwAR1234567890',
      ttclid: 'tt_12345',
      sclid: 'snap_12345',
      fbp: 'fb.1.1600000000.123456789',
      fbc: 'fb.1.1600000000.IwAR1234567890',
      gaClientId: '1234567890.1600000000',
      landingPage: 'https://supershop.sa/category/coffee',
      referrer: 'https://google.com',
    };

    const parsed = attributionSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it('rejects malicious or invalid attribution values', () => {
    expect(() =>
      attributionSchema.parse({
        unknownKey: 'invalid',
      }),
    ).toThrow();
  });

  it('validates updateTrackingIntegrationSchema with supported events', () => {
    const payload = {
      enabled: true,
      clientConfig: {
        containerId: 'GTM-ABC1234',
      },
      credentials: {
        apiSecret: 'secret_key_123',
      },
      events: [TRACKING_EVENTS.PAGE_VIEW, TRACKING_EVENTS.PURCHASE],
    };

    const parsed = updateTrackingIntegrationSchema.parse(payload);
    expect(parsed.enabled).toBe(true);
    expect(parsed.events).toHaveLength(2);
  });

  it('validates consent banner settings', () => {
    const valid = {
      enabled: true,
      defaultAnalytics: false,
      defaultMarketing: false,
      consentModeV2: true,
      privacyPolicyUrl: '/privacy',
    };

    const parsed = consentSettingsSchema.parse(valid);
    expect(parsed.enabled).toBe(true);
    expect(parsed.defaultAnalytics).toBe(false);
  });

  it('buildEcomItem standardizes items for dataLayer and server dispatch', () => {
    const item = buildEcomItem({
      id: 'v123',
      sku: 'COFFEE-DARK-500',
      name: 'Dark Roast Blend',
      price: 4500, // 45.00 SAR in halalas
      quantity: 2,
      category: 'Coffee',
      brand: 'Saudi Roastery',
      variant: '500g',
    });

    expect(item).toEqual({
      item_id: 'COFFEE-DARK-500',
      item_name: 'Dark Roast Blend',
      price: 45.0,
      quantity: 2,
      item_category: 'Coffee',
      item_brand: 'Saudi Roastery',
      item_variant: '500g',
    });
  });

  it('buildDataLayerPayload constructs GA4 e-commerce payload with event_id', () => {
    const items = [
      buildEcomItem({
        id: 'v123',
        name: 'Dark Roast Blend',
        price: 4500,
        quantity: 2,
      }),
    ];

    const payload = buildDataLayerPayload(TRACKING_EVENTS.PURCHASE, {
      eventId: 'evt_test_123',
      currency: 'SAR',
      value: 9000,
      items,
    });

    expect(payload.event).toBe('purchase');
    expect(payload.event_id).toBe('evt_test_123');
    expect(payload.ecommerce.currency).toBe('SAR');
    expect(payload.ecommerce.value).toBe(90.0);
    expect(payload.ecommerce.items).toHaveLength(1);
    expect(payload.ecommerce.items[0].price).toBe(45.0);
  });

  it('exports expected providers and consent categories', () => {
    expect(TRACKING_PROVIDERS).toEqual(['gtm', 'ga4', 'meta', 'google_ads', 'tiktok', 'snapchat']);
    expect(CONSENT_CATEGORIES).toEqual(['necessary', 'analytics', 'marketing']);
  });
});
