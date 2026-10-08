import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './core/config.js';
import { isDbReady } from './core/db.js';
import { errorHandler, notFoundHandler, sendData } from './core/http.js';
import { httpLogger } from './core/logger.js';
import { pingRedis } from './core/redis.js';

/** @typedef {{ db: () => boolean | Promise<boolean>, redis: () => boolean | Promise<boolean> }} ReadinessChecks */

/** @type {ReadinessChecks} */
const defaultChecks = { db: isDbReady, redis: () => pingRedis() };

/**
 * Builds the Express app without binding a port (tests mount it with supertest).
 * Order: request id/logging → security headers → CORS → body parsing → routes → 404 → errors.
 * @param {{ checks?: ReadinessChecks, corsOrigins?: readonly string[] }} [deps]
 */
export function createApp({ checks = defaultChecks, corsOrigins = config.CORS_ORIGINS } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  // Flat query strings only (?a=1&b=2): nested objects like ?price[$gt]=0 are never parsed,
  // which closes a common NoSQL-injection path. Filters are still whitelisted per route.
  app.set('query parser', 'simple');

  app.use(httpLogger);
  app.use(helmet());

  const allowed = new Set(corsOrigins);
  app.use(
    cors({
      // Unknown origins get no CORS headers (browser blocks); no-origin requests (curl, server-to-server) pass.
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: config.JSON_BODY_LIMIT }));

  const health = express.Router();
  // Liveness: process is up (no dependency checks, so orchestrators don't restart on a DB blip).
  health.get('/', (_req, res) =>
    sendData(res, { status: 'ok', uptime: Math.round(process.uptime()) }),
  );
  // Readiness: dependencies reachable; 503 tells the load balancer to stop routing here.
  health.get('/ready', async (_req, res) => {
    const [db, redis] = await Promise.all([
      Promise.resolve(checks.db()).catch(() => false),
      Promise.resolve(checks.redis()).catch(() => false),
    ]);
    const ready = db && redis;
    res.setHeader('Cache-Control', 'no-store');
    sendData(
      res,
      { status: ready ? 'ready' : 'not_ready', checks: { db, redis } },
      { status: ready ? 200 : 503 },
    );
  });
  app.use('/api/v1/health', health);

  // Feature module routers are mounted here (from each module's index.js) in later tasks.

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
