import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../core/http.js';
import { requireCsrfProtection } from '../csrf.js';
import { createRateLimiter } from '../rateLimit.js';
import { rejectUnsafeKeys } from '../sanitize.js';
import { validate } from '../validate.js';

const appWith = (...mw) => {
  const app = express();
  app.use(express.json());
  app.post('/t', ...mw, (req, res) => res.json({ valid: req.valid ?? null }));
  app.use(errorHandler);
  return app;
};

describe('validate', () => {
  it('strips unknown keys and exposes parsed values on req.valid', async () => {
    const app = appWith(validate({ body: z.object({ n: z.coerce.number() }) }));
    const res = await request(app).post('/t').send({ n: '5', isAdmin: true });
    expect(res.body.valid).toEqual({ body: { n: 5 } });
  });

  it('collects issues from all parts with prefixed paths', async () => {
    const app = appWith(
      validate({ query: z.object({ page: z.string() }), body: z.object({ name: z.string() }) }),
    );
    const res = await request(app).post('/t').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['name', 'query.page']);
  });
});

describe('rejectUnsafeKeys', () => {
  it.each([[{ $where: '1' }], [{ a: { b: [{ $gt: 1 }] } }], [{ 'a.b': 1 }]])(
    'rejects %j',
    async (body) => {
      const res = await request(appWith(rejectUnsafeKeys)).post('/t').send(body);
      expect(res.status).toBe(400);
    },
  );
  it('allows normal bodies and values containing $ or dots', async () => {
    const res = await request(appWith(rejectUnsafeKeys))
      .post('/t')
      .send({ note: '$5 off a.b', list: [1, 2] });
    expect(res.status).toBe(200);
  });
});

describe('requireCsrfProtection', () => {
  const app = appWith(requireCsrfProtection({ allowedOrigins: ['https://shop.test'] }));
  it('accepts header + allowed Origin, or allowed Referer when Origin is absent', async () => {
    expect(
      (await request(app).post('/t').set({ 'X-CSRF-Protection': '1', Origin: 'https://shop.test' }))
        .status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/t')
          .set({ 'X-CSRF-Protection': '1', Referer: 'https://shop.test/cart' })
      ).status,
    ).toBe(200);
  });
  it('rejects missing header, foreign or "null" origin', async () => {
    expect((await request(app).post('/t').set({ Origin: 'https://shop.test' })).status).toBe(403);
    expect(
      (await request(app).post('/t').set({ 'X-CSRF-Protection': '1', Origin: 'null' })).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/t')
          .set({ 'X-CSRF-Protection': '1', Origin: 'https://shop.test.evil.com' })
      ).status,
    ).toBe(403);
  });
});

describe('createRateLimiter', () => {
  it('returns the 429 envelope with rate-limit headers', async () => {
    const app = appWith(createRateLimiter({ name: 't', windowMs: 60_000, limit: 2 }));
    await request(app).post('/t');
    await request(app).post('/t');
    const res = await request(app).post('/t');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers.ratelimit).toBeDefined();
  });

  it('onlyFailures counts failed responses only', async () => {
    const app = express();
    app.post(
      '/t',
      createRateLimiter({ name: 'f', windowMs: 60_000, limit: 1, onlyFailures: true }),
      (req, res) => res.status(req.query.fail ? 401 : 200).end(),
    );
    app.use(errorHandler);
    for (let i = 0; i < 3; i += 1) expect((await request(app).post('/t')).status).toBe(200);
    expect((await request(app).post('/t?fail=1')).status).toBe(401);
    expect((await request(app).post('/t?fail=1')).status).toBe(429);
  });
});
