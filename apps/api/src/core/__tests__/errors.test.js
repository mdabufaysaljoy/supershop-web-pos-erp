import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConflictError, NotFoundError, RateLimitError } from '../errors.js';
import { errorHandler, notFoundHandler, sendCreated, sendData } from '../http.js';

function appWith(route) {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  app.post('/t', route);
  app.get('/t', route);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('response envelope', () => {
  it('sendData / sendCreated', async () => {
    const r1 = await request(appWith((_q, res) => sendData(res, [1], { meta: { page: 1 } }))).get(
      '/t',
    );
    expect(r1.body).toEqual({ data: [1], meta: { page: 1 } });
    const r2 = await request(appWith((_q, res) => sendCreated(res, { id: 'x' }))).get('/t');
    expect(r2.status).toBe(201);
    expect(r2.body).toEqual({ data: { id: 'x' } });
  });
});

describe('errorHandler', () => {
  it('maps AppError subclasses (incl. async throws, Express 5)', async () => {
    const res = await request(
      appWith(async () => {
        throw new NotFoundError('Product not found');
      }),
    ).get('/t');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
  });

  it('maps ZodError to VALIDATION_ERROR with field details', async () => {
    const schema = z.object({ email: z.email(), qty: z.number().int().positive() });
    const res = await request(appWith((req) => schema.parse(req.body)))
      .post('/t')
      .send({ email: 'nope', qty: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['email', 'qty']);
  });

  it('maps malformed JSON and oversize bodies', async () => {
    const app = appWith((_q, res) => res.end());
    const bad = await request(app).post('/t').set('Content-Type', 'application/json').send('{"a":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const big = await request(app)
      .post('/t')
      .send({ a: 'x'.repeat(2048) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps mongoose CastError and duplicate keys without leaking values', async () => {
    const castErr = new mongoose.Error.CastError('ObjectId', 'zzz', '_id');
    const r1 = await request(
      appWith(() => {
        throw castErr;
      }),
    ).get('/t');
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe('BAD_REQUEST');

    const dup = Object.assign(new Error('E11000 dup key: { email: "a@b.c" }'), {
      code: 11000,
      keyPattern: { email: 1 },
      keyValue: { email: 'a@b.c' },
    });
    const r2 = await request(
      appWith(() => {
        throw dup;
      }),
    ).get('/t');
    expect(r2.status).toBe(409);
    expect(r2.body.error).toEqual({
      code: 'CONFLICT',
      message: 'Duplicate value',
      details: { fields: ['email'] },
    });
    expect(JSON.stringify(r2.body)).not.toContain('a@b.c');
  });

  it('hides internals of unknown errors', async () => {
    const res = await request(
      appWith(() => {
        throw new Error('db password is hunter2');
      }),
    ).get('/t');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });

  it('sets Retry-After for 429 and keeps conflict details', async () => {
    const r1 = await request(
      appWith(() => {
        throw new RateLimitError();
      }),
    ).get('/t');
    expect(r1.status).toBe(429);
    expect(r1.headers['retry-after']).toBe('30');
    const r2 = await request(
      appWith(() => {
        throw new ConflictError('Stock changed', { sku: 'A-1' });
      }),
    ).get('/t');
    expect(r2.body.error.details).toEqual({ sku: 'A-1' });
  });

  it('404s unmatched routes', async () => {
    const res = await request(appWith((_q, res) => res.end())).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
