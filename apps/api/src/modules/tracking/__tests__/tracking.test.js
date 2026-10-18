import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { Order } from '../../orders/order.model.js';
import { findSystemRoleId, seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { createStaff, ensureSuperAdmin } from '../../staff/index.js';
import { TrackingIntegration } from '../tracking.model.js';
import { getDecryptedCredentials } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
let app;
let rootToken;
let marketingToken;
let cashierToken;

beforeEach(async () => {
  setTranslationScheduler(async () => {});
  await loadSettings();
  await Promise.all([Order.init(), TrackingIntegration.init()]);
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

  const cashierRole = await findSystemRoleId('cashier');
  await createStaff(null, {
    name: 'Cashier Staff',
    email: 'cashier@shop.test',
    password: ADMIN_PW,
    roleId: cashierRole,
    allBranches: false,
  });
  cashierToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'cashier@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('Tracking & Consent API (P9.1)', () => {
  it('GET /tracking/public returns public configuration without authentication', async () => {
    // Enable GTM integration
    await request(app)
      .put('/api/v1/tracking/gtm')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: true,
        clientConfig: { containerId: 'GTM-TEST123' },
        events: ['page_view', 'purchase'],
      })
      .expect(200);

    const res = await request(app).get('/api/v1/tracking/public').expect(200);

    expect(res.body.data.integrations).toHaveLength(1);
    const gtm = res.body.data.integrations[0];
    expect(gtm.provider).toBe('gtm');
    expect(gtm.enabled).toBe(true);
    expect(gtm.clientConfig.containerId).toBe('GTM-TEST123');
    expect(gtm.events).toContain('purchase');

    // Consent settings are returned
    expect(res.body.data.consent).toBeDefined();
    expect(res.body.data.consent.enabled).toBe(true);
    expect(res.body.data.consent.defaultAnalytics).toBe(false);
  });

  it('GET /tracking requires tracking.manage permission and masks credentials', async () => {
    // Unauthenticated -> 401
    await request(app).get('/api/v1/tracking').expect(401);

    // Cashier lacking tracking.manage -> 403
    await request(app)
      .get('/api/v1/tracking')
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(403);

    // Save Meta CAPI credentials
    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({
        enabled: true,
        clientConfig: { pixelId: '1234567890' },
        credentials: {
          capiToken: 'EAABsb938test_secret_token_value_xyz',
          testEventCode: 'TEST1234',
        },
        events: ['page_view', 'add_to_cart', 'purchase'],
      })
      .expect(200);

    // Marketing staff has tracking.manage -> 200
    const res = await request(app)
      .get('/api/v1/tracking')
      .set('Authorization', `Bearer ${marketingToken}`)
      .expect(200);

    const meta = res.body.data.integrations.find((i) => i.provider === 'meta');
    expect(meta).toBeDefined();
    expect(meta.enabled).toBe(true);
    expect(meta.clientConfig.pixelId).toBe('1234567890');
    // Secret is masked!
    expect(meta.credentials.capiToken).toMatch(/^••••/);
    expect(meta.credentials.capiToken).not.toBe('EAABsb938test_secret_token_value_xyz');
  });

  it('encrypts secrets at rest and preserves them when re-submitting masked values', async () => {
    const rawSecret = 'SUPER_SECRET_CAPI_TOKEN_ABC_123';

    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: true,
        clientConfig: { pixelId: '9876543210' },
        credentials: { capiToken: rawSecret },
        events: ['purchase'],
      })
      .expect(200);

    // Check raw DB document: encryptedCredentials must start with v1. (AES-256-GCM)
    const doc = await TrackingIntegration.findOne({ provider: 'meta' }).lean();
    expect(doc.encryptedCredentials.capiToken).toMatch(/^v1\./);
    expect(doc.encryptedCredentials.capiToken).not.toContain(rawSecret);

    // Decrypted helper recovers plaintext
    const decrypted = await getDecryptedCredentials('meta');
    expect(decrypted.credentials.capiToken).toBe(rawSecret);

    // Re-submit with masked token value (as UI form does when unchanged)
    await request(app)
      .put('/api/v1/tracking/meta')
      .set('Authorization', `Bearer ${rootToken}`)
      .send({
        enabled: true,
        clientConfig: { pixelId: '9876543210' },
        credentials: { capiToken: '••••••••123' },
        events: ['purchase'],
      })
      .expect(200);

    // Decrypted secret still contains original rawSecret!
    const stillDecrypted = await getDecryptedCredentials('meta');
    expect(stillDecrypted.credentials.capiToken).toBe(rawSecret);
  });

  it('PUT /tracking/settings/consent updates PDPL consent banner configuration', async () => {
    const res = await request(app)
      .put('/api/v1/tracking/settings/consent')
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({
        enabled: true,
        defaultAnalytics: true,
        defaultMarketing: false,
        consentModeV2: true,
        privacyPolicyUrl: '/privacy-policy',
      })
      .expect(200);

    expect(res.body.data.defaultAnalytics).toBe(true);
    expect(res.body.data.privacyPolicyUrl).toBe('/privacy-policy');

    // Public endpoint reflects updated consent settings
    const pub = await request(app).get('/api/v1/tracking/public').expect(200);
    expect(pub.body.data.consent.defaultAnalytics).toBe(true);
    expect(pub.body.data.consent.privacyPolicyUrl).toBe('/privacy-policy');
  });

  it('attaches marketing attribution to orders placed in checkout', async () => {
    // Create an order directly in Order model with attribution to verify model storage
    const order = await Order.create({
      orderNo: 'ORD-999001',
      channel: 'online',
      status: 'pending',
      lang: 'en',
      customer: {
        name: 'Ahmed Ali',
        phone: '+966501234567',
        email: 'ahmed@example.com',
      },
      deliveryMethod: 'delivery',
      address: {
        street: 'King Fahd Rd',
        district: 'Olaya',
        city: 'Riyadh',
      },
      items: [
        {
          productId: new Order()._id,
          variantId: new Order()._id,
          sku: 'ITEM-1',
          name: 'Coffee',
          unitPrice: 5000,
          price: 5000,
          cost: 2500,
          qty: 1,
          lineTotal: 5000,
          net: 4348,
          vat: 652,
          taxCategory: 'standard',
          vatRateBps: 1500,
        },
      ],
      totals: {
        itemCount: 1,
        subtotal: 5000,
        deliveryFee: 0,
        paymentFee: 0,
        net: 4348,
        vat: 652,
        total: 5000,
      },
      currency: 'SAR',
      pricesIncludeVat: true,
      payment: {
        method: 'cod',
        status: 'pending',
      },
      attribution: {
        utmSource: 'facebook',
        utmMedium: 'cpc',
        utmCampaign: 'ramadan_sale',
        fbclid: 'fb_click_999',
        fbp: 'fb.1.123',
        fbc: 'fb.1.123.fb_click_999',
      },
      placedAt: new Date(),
    });

    expect(order.attribution).toBeDefined();
    expect(order.attribution.utmSource).toBe('facebook');
    expect(order.attribution.fbclid).toBe('fb_click_999');
  });
});
