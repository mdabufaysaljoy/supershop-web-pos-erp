import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useMemoryMongo } from '../../../../test/mongo.js';
import { createApp } from '../../../app.js';
import { seedDefaultRoles } from '../../rbac/index.js';
import { loadSettings } from '../../settings/index.js';
import { ensureSuperAdmin } from '../../staff/index.js';
import { Subscriber } from '../subscriber.model.js';

useMemoryMongo({ beforeAll, afterAll, afterEach });

const ADMIN_PW = 'staff-pass-123';
let app;
let rootToken;

const root = {
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${rootToken}`),
  post: (url, body) =>
    request(app).post(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  patch: (url, body) =>
    request(app).patch(url).set('Authorization', `Bearer ${rootToken}`).send(body),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${rootToken}`),
};

beforeEach(async () => {
  await loadSettings();
  await Subscriber.init();
  app = createApp({ checks: { db: () => true, redis: async () => true } });
  await seedDefaultRoles();
  await ensureSuperAdmin({ name: 'Root Admin', email: 'root@shop.test', password: ADMIN_PW });
  rootToken = (
    await request(app)
      .post('/api/v1/auth/staff/login')
      .send({ email: 'root@shop.test', password: ADMIN_PW })
  ).body.data.accessToken;
});

describe('Newsletter & Subscriber System (P7.3)', () => {
  describe('Public Newsletter Opt-In', () => {
    it('subscribes a new email via JSON POST /api/v1/newsletter', async () => {
      const res = await request(app)
        .post('/api/v1/newsletter')
        .send({ email: 'Shopper@Domain.com' });

      expect(res.status).toBe(201);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.subscriber.email).toBe('shopper@domain.com');
      expect(res.body.data.subscriber.status).toBe('subscribed');

      const saved = await Subscriber.findOne({ email: 'shopper@domain.com' });
      expect(saved).not.toBeNull();
      expect(saved.status).toBe('subscribed');
    });

    it('subscribes via public alias POST /api/v1/subscribers', async () => {
      const res = await request(app).post('/api/v1/subscribers').send({ email: 'vip@domain.com' });

      expect(res.status).toBe(201);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.subscriber.email).toBe('vip@domain.com');
    });

    it('is idempotent for already-subscribed emails', async () => {
      await request(app).post('/api/v1/newsletter').send({ email: 'repeat@domain.com' });

      const res = await request(app)
        .post('/api/v1/newsletter')
        .send({ email: 'repeat@domain.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.alreadySubscribed).toBe(true);

      const count = await Subscriber.countDocuments({ email: 'repeat@domain.com' });
      expect(count).toBe(1);
    });

    it('reactivates an unsubscribed user if they re-subscribe', async () => {
      const sub = await Subscriber.create({
        email: 'reactivate@domain.com',
        status: 'unsubscribed',
        unsubscribedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/newsletter')
        .send({ email: 'reactivate@domain.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.alreadySubscribed).toBe(false);

      const updated = await Subscriber.findById(sub._id);
      expect(updated.status).toBe('subscribed');
      expect(updated.unsubscribedAt).toBeNull();
    });

    it('rejects invalid email addresses with 400 ValidationError', async () => {
      const res = await request(app).post('/api/v1/newsletter').send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles standard URL-encoded form submissions from browsers gracefully', async () => {
      const res = await request(app)
        .post('/api/v1/newsletter')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('Referer', 'http://localhost:3000/')
        .send('email=browserform%40domain.com');

      expect(res.status).toBe(303);
      expect(res.headers.location).toContain('newsletter=subscribed');

      const saved = await Subscriber.findOne({ email: 'browserform@domain.com' });
      expect(saved).not.toBeNull();
    });
  });

  describe('Admin Subscribers Management', () => {
    it('requires CAMPAIGN_VIEW permission to list subscribers', async () => {
      const unauth = await request(app).get('/api/v1/subscribers');
      expect(unauth.status).toBe(401);
    });

    it('lists subscribers with search, status filtering, and counts', async () => {
      await Subscriber.create([
        { email: 'alpha@domain.com', status: 'subscribed' },
        { email: 'beta@domain.com', status: 'subscribed' },
        { email: 'gamma@domain.com', status: 'unsubscribed' },
      ]);

      const resAll = await root.get('/api/v1/subscribers');
      expect(resAll.status).toBe(200);
      expect(resAll.body.data).toHaveLength(3);
      expect(resAll.body.meta.total).toBe(3);
      expect(resAll.body.meta.activeCount).toBe(2);
      expect(resAll.body.meta.unsubscribedCount).toBe(1);

      const resFilter = await root.get('/api/v1/subscribers?status=unsubscribed');
      expect(resFilter.body.data).toHaveLength(1);
      expect(resFilter.body.data[0].email).toBe('gamma@domain.com');

      const resSearch = await root.get('/api/v1/subscribers?q=alpha');
      expect(resSearch.body.data).toHaveLength(1);
      expect(resSearch.body.data[0].email).toBe('alpha@domain.com');
    });

    it('updates a subscriber status and unsubscribedAt date', async () => {
      const sub = await Subscriber.create({
        email: 'toggle@domain.com',
        status: 'subscribed',
      });

      const res = await root.patch(`/api/v1/subscribers/${sub._id}`, { status: 'unsubscribed' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('unsubscribed');
      expect(res.body.data.unsubscribedAt).not.toBeNull();

      const resBack = await root.patch(`/api/v1/subscribers/${sub._id}`, { status: 'subscribed' });
      expect(resBack.status).toBe(200);
      expect(resBack.body.data.status).toBe('subscribed');
      expect(resBack.body.data.unsubscribedAt).toBeNull();
    });

    it('deletes a subscriber by ID', async () => {
      const sub = await Subscriber.create({ email: 'delete-me@domain.com' });

      const res = await root.delete(`/api/v1/subscribers/${sub._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      const count = await Subscriber.countDocuments({ _id: sub._id });
      expect(count).toBe(0);
    });
  });
});
