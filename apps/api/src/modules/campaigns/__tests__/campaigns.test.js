import { CUSTOMER_SEGMENTS } from '@supershop/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { setTranslationScheduler } from '../../i18n/localized.plugin.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Customer } from '../../customers/customer.model.js';
import { resetProviderCache } from '../../notifications/index.js';
import { Campaign, CampaignDelivery } from '../campaign.model.js';
import { createUnsubscribeToken } from '../campaign.unsubscribeToken.js';
import { setCampaignCanceler, setCampaignDispatcher } from '../index.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
const BASE = '/api/v1/campaigns';
let app;
let rootToken;

const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
};

beforeEach(async () => {
  resetProviderCache();
  setTranslationScheduler(async () => {});
  setCampaignDispatcher(async () => {});
  setCampaignCanceler(async () => true);
  await loadSettings();
  await Promise.all([Customer.init(), Campaign.init(), CampaignDelivery.init()]);
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('Campaigns API Module (P7.3)', () => {
  it('creates and lists draft campaigns with filtering', async () => {
    const resCreate = await root.post(BASE, {
      name: 'Black Friday Email',
      channel: 'email',
      segment: CUSTOMER_SEGMENTS.ALL,
      subject: 'Massive Discounts This Friday',
      message: 'Hello {{customer.name}}, get up to 50% off everything at {{store.name}}!',
    });

    expect(resCreate.status).toBe(201);
    expect(resCreate.body.data.name).toBe('Black Friday Email');
    expect(resCreate.body.data.status).toBe('draft');
    expect(resCreate.body.data.channel).toBe('email');

    const resList = await root.get(`${BASE}?channel=email&status=draft`);
    expect(resList.status).toBe(200);
    expect(resList.body.data).toHaveLength(1);
    expect(resList.body.data[0].name).toBe('Black Friday Email');
  });

  it('updates draft campaign and validates editing restrictions', async () => {
    const resCreate = await root.post(BASE, {
      name: 'SMS Flash Sale',
      channel: 'sms',
      segment: CUSTOMER_SEGMENTS.ACTIVE,
      message: 'Flash sale starts now!',
    });
    const campaignId = resCreate.body.data.id;

    const resUpdate = await root.patch(`${BASE}/${campaignId}`, {
      name: 'SMS Flash Sale Updated',
      message: 'New message with promo code!',
    });
    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.data.name).toBe('SMS Flash Sale Updated');
  });

  it('schedules and cancels a campaign', async () => {
    const resCreate = await root.post(BASE, {
      name: 'Scheduled Promo',
      channel: 'email',
      segment: CUSTOMER_SEGMENTS.ALL,
      subject: 'Coming Soon',
      message: 'Check out our future catalog!',
    });
    const campaignId = resCreate.body.data.id;

    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const resSchedule = await root.post(`${BASE}/${campaignId}/schedule`, {
      scheduledAt: futureDate,
    });
    expect(resSchedule.status).toBe(200);
    expect(resSchedule.body.data.status).toBe('scheduled');
    expect(resSchedule.body.data.scheduledAt).toBe(futureDate);

    const resCancel = await root.post(`${BASE}/${campaignId}/cancel`, {});
    expect(resCancel.status).toBe(200);
    expect(resCancel.body.data.status).toBe('cancelled');
  });

  it('dispatches campaign to targeted audience and skips opted-out customers', async () => {
    // Seed test customers
    await Customer.create({
      name: 'Ahmad Al-Harbi',
      email: 'ahmad@example.com',
      phone: '+966500000001',
      lang: 'en',
      status: 'active',
    });
    await Customer.create({
      name: 'Fatima Al-Zahrani',
      email: 'fatima@example.com',
      phone: '+966500000002',
      lang: 'ar',
      status: 'active',
      marketingOptOut: { email: true, sms: false }, // opted out of email
    });
    await Customer.create({
      name: 'Omar Farooq',
      email: 'omar@example.com',
      phone: '+966500000003',
      lang: 'ar',
      status: 'active',
      marketingOptOut: { email: false, sms: false },
    });

    // Check audience count for email
    const resAudience = await root.get(`${BASE}/audience-count?segment=all&channel=email`);
    expect(resAudience.status).toBe(200);
    // c1 and c3 (c2 is opted out of email)
    expect(resAudience.body.data.count).toBe(2);

    // Create and send an email campaign inline
    const resCreate = await root.post(BASE, {
      name: 'Eid Greeting',
      channel: 'email',
      segment: CUSTOMER_SEGMENTS.ALL,
      subject: 'Happy Eid!',
      message:
        'Dear {{customer.name}}, Eid Mubarak from {{store.name}}! Unsubscribe: {{unsubscribe_url}}',
    });
    const campaignId = resCreate.body.data.id;

    // Send immediately inline
    const resSend = await root.post(`${BASE}/${campaignId}/send?inline=true`, {});
    expect(resSend.status).toBe(200);
    expect(resSend.body.data.status).toBe('sent');
    expect(resSend.body.data.stats.targeted).toBe(2);
    expect(resSend.body.data.stats.sent).toBe(2);

    // Verify delivery logs
    const resDeliveries = await root.get(`${BASE}/${campaignId}/deliveries`);
    expect(resDeliveries.status).toBe(200);
    expect(resDeliveries.body.data).toHaveLength(2);
    const recipients = resDeliveries.body.data.map((d) => d.recipient);
    expect(recipients).toContain('ahmad@example.com');
    expect(recipients).toContain('omar@example.com');
    expect(recipients).not.toContain('fatima@example.com');
  });

  it('handles customer unsubscribe via signed token and email', async () => {
    const cust = await Customer.create({
      name: 'Khalid',
      email: 'khalid@test.sa',
      phone: '+966555555555',
      status: 'active',
    });

    const token = createUnsubscribeToken({ customerId: String(cust._id), channel: 'email' });

    // Public GET endpoint (renders HTML confirmation)
    const resGet = await request(app).get(`/api/v1/campaigns/unsubscribe?token=${token}`);
    expect(resGet.status).toBe(200);
    expect(resGet.text).toContain('You have been unsubscribed');

    const updated = await Customer.findById(cust._id);
    expect(updated.marketingOptOut.email).toBe(true);
    expect(updated.marketingOptOut.sms).toBe(false);

    // Public POST endpoint to opt-out all channels by email
    const resPost = await request(app)
      .post('/api/v1/campaigns/unsubscribe')
      .send({ email: 'khalid@test.sa', channel: 'all' });
    expect(resPost.status).toBe(200);
    expect(resPost.body.data.success).toBe(true);

    const reUpdated = await Customer.findById(cust._id);
    expect(reUpdated.marketingOptOut.email).toBe(true);
    expect(reUpdated.marketingOptOut.sms).toBe(true);
  });

  it('sends test message to arbitrary recipient', async () => {
    const resCreate = await root.post(BASE, {
      name: 'Test Message Template',
      channel: 'email',
      segment: CUSTOMER_SEGMENTS.ALL,
      subject: 'Test Subject',
      message: 'Test message for {{customer.name}}',
    });
    const campaignId = resCreate.body.data.id;

    const resTest = await root.post(`${BASE}/${campaignId}/test`, {
      channel: 'email',
      to: 'tester@example.com',
      lang: 'en',
    });
    expect(resTest.status).toBe(200);
    expect(resTest.body.data.status).toBe('sent');
  });
});
