import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const up = { db: () => true, redis: async () => true };

describe('app', () => {
  it('GET /api/v1/health is a dependency-free liveness probe', async () => {
    const res = await request(createApp({ checks: up })).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /api/v1/health/ready reports dependency status (503 when any is down)', async () => {
    const ok = await request(createApp({ checks: up })).get('/api/v1/health/ready');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ status: 'ready', checks: { db: true, redis: true } });

    const down = { db: () => true, redis: async () => Promise.reject(new Error('ECONNREFUSED')) };
    const bad = await request(createApp({ checks: down })).get('/api/v1/health/ready');
    expect(bad.status).toBe(503);
    expect(bad.body.data.checks).toEqual({ db: true, redis: false });
  });

  it('assigns a request id, or reuses a well-formed incoming one', async () => {
    const app = createApp({ checks: up });
    const gen = await request(app).get('/api/v1/nope');
    expect(gen.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(gen.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Route not found',
      requestId: gen.headers['x-request-id'],
    });

    const reuse = await request(app).get('/api/v1/health').set('X-Request-Id', 'nginx-abc12345');
    expect(reuse.headers['x-request-id']).toBe('nginx-abc12345');
    const reject = await request(app).get('/api/v1/health').set('X-Request-Id', 'bad id <script>');
    expect(reject.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers', async () => {
    const res = await request(createApp({ checks: up })).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('CORS: allowlisted origins get credentials headers, others get none', async () => {
    const app = createApp({ checks: up, corsOrigins: ['http://localhost:3000'] });
    const ok = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not parse nested query objects (NoSQL-injection guard)', async () => {
    const app = createApp({ checks: up });
    // With the simple parser, `price[$gt]` stays a flat string key; asserting via a probe route
    // would need a module router, so assert the setting directly.
    expect(app.get('query parser')).toBe('simple');
  });
});
