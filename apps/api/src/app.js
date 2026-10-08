import express from 'express';

/**
 * Builds the Express application without binding a port (so tests can mount it with supertest).
 * Security middleware, envelope, error handler and module routers are wired in P0.2+.
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Liveness probe — no DB/Redis dependency so orchestrators can tell "process up" apart from
  // "dependencies ready" (a readiness probe is added with the db/queue core in P0.2).
  app.get('/api/v1/health', (_req, res) => {
    res.json({ data: { status: 'ok', uptime: Math.round(process.uptime()) } });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  return app;
}
