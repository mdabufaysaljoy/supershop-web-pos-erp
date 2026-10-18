import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { eventBus } from '../../../core/events.js';
import { EVENTS } from '@supershop/shared';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { TrackingIntegration } from '../tracking.model.js';
import { TrackingEventLog } from '../trackingLog.model.js';
import { dispatchMetaCapi } from '../adapters/metaCapi.js';
import { dispatchGa4Mp } from '../adapters/ga4MeasurementProtocol.js';
import { dispatchGoogleAds } from '../adapters/googleAdsEnhanced.js';
import { processTrackingJob, sanitizePayloadForLogging } from '../tracking.jobs.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
let app;
let rootToken;
let marketingToken;

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Order.init(), TrackingIntegration.init(), TrackingEventLog.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });

  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;

  const marketingRole = await findSystemRoleId('marketing');
  await createStaff(null, {
    name: 'Marketing Staff',
    email: 'mkt@shop.test',
    password: ADMIN_PW,
    roleId: marketingRole,
    allBranches: true,
  });
  marketingToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'mkt@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('Tracking Server-Side Adapters (P9.2)', () => {
  it('dispatchMetaCapi hashes PII and constructs Graph API request', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ events_received: 1, fbtrace_id: 'trace123' }),
      };
    });

    const result = await dispatchMetaCapi({
      config: { pixelId: '9988776655' },
      credentials: { capiToken: 'TEST_CAPI_TOKEN' },
      payload: {
        event: 'purchase',
        eventId: 'evt_purchase_123',
        orderNumber: 'ORD-1001',
        value: 250,
        currency: 'SAR',
        customer: {
          email: 'Ahmed.User@Example.COM ',
          phone: '0501234567',
          name: 'Ahmed Ali',
        },
        attribution: {
          fbp: 'fb.1.123',
          fbc: 'fb.1.123.click',
          clientIpAddress: '192.168.1.1',
          clientUserAgent: 'Mozilla/5.0',
          landingPage: 'https://shop.test/checkout',
        },
        items: [{ id: 'PROD-1', quantity: 2, price: 125 }],
        testEventCode: 'TEST9999',
      },
      options: { fetchImpl: mockFetch },
    });

    expect(result.success).toBe(true);
    expect(result.eventsReceived).toBe(1);
    expect(capturedUrl).toContain('9988776655/events?access_token=TEST_CAPI_TOKEN');

    expect(capturedBody.test_event_code).toBe('TEST9999');
    const event = capturedBody.data[0];
    expect(event.event_name).toBe('Purchase');
    expect(event.event_id).toBe('evt_purchase_123');
    expect(event.custom_data.order_id).toBe('ORD-1001');
    expect(event.custom_data.value).toBe(250);

    // Verify PII is SHA-256 hashed (64 hex characters) and NOT plaintext
    expect(event.user_data.em[0]).toHaveLength(64);
    expect(event.user_data.em[0]).not.toContain('ahmed');
    expect(event.user_data.ph[0]).toHaveLength(64);
    expect(event.user_data.ph[0]).not.toContain('0501234567');
    expect(event.user_data.fn[0]).toHaveLength(64);
    expect(event.user_data.ln[0]).toHaveLength(64);
    // fbp / fbc are raw strings
    expect(event.user_data.fbp).toBe('fb.1.123');
    expect(event.user_data.fbc).toBe('fb.1.123.click');
  });

  it('dispatchGa4Mp dispatches to Measurement Protocol and supports debug endpoint', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ validationMessages: [] }),
      };
    });

    const result = await dispatchGa4Mp({
      config: { measurementId: 'G-TEST1234', debugMode: true },
      credentials: { apiSecret: 'GA4_API_SECRET' },
      payload: {
        event: 'purchase',
        eventId: 'evt_ga4_1',
        orderNumber: 'ORD-2002',
        value: 150,
        currency: 'SAR',
        customer: { id: 'cust_77' },
        attribution: { gaClientId: '123456789.987654321' },
        items: [{ item_id: 'SKU-A', item_name: 'Product A', price: 150, quantity: 1 }],
      },
      options: { fetchImpl: mockFetch },
    });

    expect(result.success).toBe(true);
    expect(result.isDebug).toBe(true);
    expect(capturedUrl).toContain(
      '/debug/mp/collect?measurement_id=G-TEST1234&api_secret=GA4_API_SECRET',
    );
    expect(capturedBody.client_id).toBe('123456789.987654321');
    expect(capturedBody.user_id).toBe('cust_77');
    expect(capturedBody.events[0].name).toBe('purchase');
    expect(capturedBody.events[0].params.transaction_id).toBe('ORD-2002');
  });

  it('dispatchGoogleAds hashes user_data and builds enhanced conversion payload', async () => {
    const result = await dispatchGoogleAds({
      config: { conversionId: 'AW-123456', conversionLabel: 'LABEL_ABC' },
      payload: {
        event: 'purchase',
        eventId: 'evt_gads_1',
        orderNumber: 'ORD-3003',
        value: 300,
        currency: 'SAR',
        customer: {
          email: 'customer@test.com',
          phone: '0555555555',
        },
        attribution: { gclid: 'test_gclid_123' },
      },
    });

    expect(result.success).toBe(true);
    const data = result.response.conversionData;
    expect(data.conversion_id).toBe('AW-123456');
    expect(data.conversion_label).toBe('LABEL_ABC');
    expect(data.gclid).toBe('test_gclid_123');
    expect(data.user_data.sha256_email_address).toHaveLength(64);
    expect(data.user_data.sha256_phone_number).toHaveLength(64);
  });
});

describe('Tracking Job Worker & Logging (P9.2)', () => {
  it('sanitizePayloadForLogging hashes email, phone, and name', () => {
    const payload = {
      event: 'purchase',
      customer: {
        email: 'test@example.com',
        phone: '0501112233',
        name: 'First Last',
      },
      value: 100,
    };

    const sanitized = sanitizePayloadForLogging(payload);
    expect(sanitized.customer.email).toHaveLength(64);
    expect(sanitized.customer.phone).toHaveLength(64);
    expect(sanitized.customer.name).toHaveLength(64);
    expect(sanitized.customer.email).not.toContain('test@example.com');
  });

  it('processTrackingJob skips when provider is disabled or event is not enabled', async () => {
    // Save integration disabled
    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: false,
        clientConfig: { pixelId: '111111' },
        credentials: { capiToken: 'TOKEN' },
        events: ['purchase'],
      })
      .expect(200);

    const log = await TrackingEventLog.create({
      provider: 'meta',
      event: 'purchase',
      eventId: 'evt_skip_1',
      status: 'pending',
    });

    const result = await processTrackingJob({
      data: {
        logId: String(log._id),
        provider: 'meta',
        event: 'purchase',
        eventId: 'evt_skip_1',
      },
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('provider_disabled');

    const updatedLog = await TrackingEventLog.findById(log._id).lean();
    expect(updatedLog.status).toBe('skipped');
    expect(updatedLog.skipReason).toBe('provider_disabled');
  });

  it('processTrackingJob gates dispatch when PDPL consent is denied', async () => {
    // Enable Meta integration
    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: true,
        clientConfig: { pixelId: '222222' },
        credentials: { capiToken: 'TOKEN' },
        events: ['purchase'],
      })
      .expect(200);

    const log = await TrackingEventLog.create({
      provider: 'meta',
      event: 'purchase',
      eventId: 'evt_consent_1',
      status: 'pending',
    });

    const result = await processTrackingJob({
      data: {
        logId: String(log._id),
        provider: 'meta',
        event: 'purchase',
        eventId: 'evt_consent_1',
        consent: { marketing: false, analytics: true },
      },
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('consent_denied');

    const updatedLog = await TrackingEventLog.findById(log._id).lean();
    expect(updatedLog.status).toBe('skipped');
    expect(updatedLog.skipReason).toBe('consent_denied');
  });
});

describe('Tracking Admin Endpoints & Event Logs (P9.2)', () => {
  it('GET /tracking/logs returns paginated logs with filters', async () => {
    await TrackingEventLog.create([
      {
        provider: 'meta',
        event: 'purchase',
        eventId: 'log_meta_1',
        orderNumber: 'ORD-8881',
        status: 'success',
      },
      {
        provider: 'ga4',
        event: 'purchase',
        eventId: 'log_ga4_1',
        orderNumber: 'ORD-8882',
        status: 'failed',
        errorMessage: 'Network error',
      },
      {
        provider: 'meta',
        event: 'add_to_cart',
        eventId: 'log_meta_2',
        status: 'skipped',
        skipReason: 'consent_denied',
      },
    ]);

    const res = await request(app)
      .get('/api/v1/tracking/logs?provider=meta')
      .set('Authorization', `Bearer ${marketingToken}`)
      .expect(200);

    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);

    // Filter by status failed
    const failedRes = await request(app)
      .get('/api/v1/tracking/logs?status=failed')
      .set('Authorization', `Bearer ${marketingToken}`)
      .expect(200);

    expect(failedRes.body.data.items).toHaveLength(1);
    expect(failedRes.body.data.items[0].errorMessage).toBe('Network error');
  });

  it('GET /tracking/logs/:id returns single log details', async () => {
    const created = await TrackingEventLog.create({
      provider: 'ga4',
      event: 'purchase',
      eventId: 'log_detail_1',
      orderNumber: 'ORD-999',
      status: 'success',
      latencyMs: 142,
    });

    const res = await request(app)
      .get(`/api/v1/tracking/logs/${created._id}`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .expect(200);

    expect(res.body.data.orderNumber).toBe('ORD-999');
    expect(res.body.data.latencyMs).toBe(142);
  });

  it('POST /tracking/test dispatches test event and logs outcome', async () => {
    // Configure Meta
    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: true,
        clientConfig: { pixelId: '123456' },
        credentials: { capiToken: 'TEST_TOKEN' },
        events: ['purchase'],
      })
      .expect(200);

    // Mock fetch for test
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ events_received: 1 }),
    });

    try {
      const res = await request(app)
        .post('/api/v1/tracking/test')
        .set('Authorization', `Bearer ${marketingToken}`)
        .send({
          provider: 'meta',
          event: 'purchase',
          testEventCode: 'TEST_CODE_XYZ',
          orderNumber: 'TEST-ORD-555',
          value: 120,
        })
        .expect(200);

      expect(res.body.data.success).toBe(true);
      expect(res.body.data.log.isTest).toBe(true);
      expect(res.body.data.log.testEventCode).toBe('TEST_CODE_XYZ');
      expect(res.body.data.log.status).toBe('success');
    } finally {
      global.fetch = origFetch;
    }
  });

  it('POST /tracking/events provides public server-side event ingestion', async () => {
    const res = await request(app)
      .post('/api/v1/tracking/events')
      .send({
        event: 'purchase',
        orderNumber: 'ORD-PUBLIC-1',
        value: 180,
        currency: 'SAR',
        customer: { email: 'guest@test.com' },
        attribution: { utmSource: 'newsletter' },
      })
      .expect(202);

    expect(res.body.data.enqueued).toBe(true);
    expect(res.body.data.eventId).toBeDefined();
  });

  it('subscribers enqueue tracking events on domain events like ORDER_PAID', async () => {
    // Configure Meta enabled
    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: true,
        clientConfig: { pixelId: '445566' },
        credentials: { capiToken: 'TOKEN_445566' },
        events: ['purchase'],
      })
      .expect(200);

    const order = await Order.create({
      orderNo: 'ORD-SUB-100',
      channel: 'online',
      status: 'pending',
      lang: 'en',
      customer: {
        name: 'Buyer',
        phone: '0501234567',
        email: 'buyer@shop.test',
      },
      deliveryMethod: 'delivery',
      items: [
        {
          productId: new Order()._id,
          variantId: new Order()._id,
          sku: 'SKU-SUB',
          name: 'Sub Product',
          unitPrice: 20000,
          price: 20000,
          cost: 10000,
          qty: 1,
          lineTotal: 20000,
          net: 17391,
          vat: 2609,
          taxCategory: 'standard',
          vatRateBps: 1500,
        },
      ],
      totals: {
        itemCount: 1,
        subtotal: 20000,
        deliveryFee: 0,
        paymentFee: 0,
        net: 17391,
        vat: 2609,
        total: 20000,
      },
      currency: 'SAR',
      pricesIncludeVat: true,
      payment: {
        method: 'card',
        status: 'pending',
      },
      attribution: {
        utmSource: 'google',
        eventId: 'custom_evt_sub_1',
      },
      placedAt: new Date(),
    });

    void eventBus.emit(EVENTS.ORDER_PAID, { orderId: String(order._id) });

    // Allow event loop to process
    await new Promise((r) => setTimeout(r, 50));

    const log = await TrackingEventLog.findOne({ orderNumber: 'ORD-SUB-100' }).lean();
    expect(log).toBeTruthy();
    expect(log.provider).toBe('meta');
    expect(log.event).toBe('purchase');
    expect(log.eventId).toBe('custom_evt_sub_1');
    expect(log.status).toBe('pending');
  });
});
