import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../core/config.js';
import { sha256 } from '../core/crypto.js';
import { RateLimitError } from '../core/errors.js';
import { getRedis } from '../core/redis.js';

/**
 * Rate limiter factory (CLAUDE.md §5.1). Counters live in Redis so limits hold across processes;
 * tests use the in-memory store.
 *
 * @param {object} opts
 * @param {string} opts.name        unique per limiter (Redis key prefix)
 * @param {number} opts.windowMs
 * @param {number} opts.limit       requests per window per key
 * @param {(req: import('express').Request) => string} [opts.key]  extra key part (e.g. login identifier)
 * @param {boolean} [opts.failClosed]  block when Redis is down (auth endpoints) instead of allowing
 * @param {(req: import('express').Request) => boolean} [opts.skip]
 * @param {boolean} [opts.onlyFailures]  count only 4xx/5xx responses (brute-force limiters)
 */
export function createRateLimiter({
  name,
  windowMs,
  limit,
  key,
  failClosed = false,
  skip,
  onlyFailures = false,
}) {
  const store = config.isTest
    ? undefined
    : new RedisStore({
        prefix: `supershop:rl:${name}:`,
        sendCommand: (command, ...args) => getRedis().call(command, ...args),
      });

  return rateLimit({
    windowMs,
    limit,
    store,
    skip,
    skipSuccessfulRequests: onlyFailures,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: !failClosed,
    identifier: name,
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip ?? '', 56);
      // Hash the extra part so raw identifiers (emails/phones) never land in Redis keys.
      return key ? `${ip}:${sha256(String(key(req) ?? '').toLowerCase()).slice(0, 24)}` : ip;
    },
    handler: (_req, _res, next) => next(new RateLimitError()),
  });
}

const MINUTE = 60_000;

/** Named limits. Tune here; per-route limiters are created once at module load. */
export const LIMITS = Object.freeze({
  global: { windowMs: MINUTE, limit: 600 },
  login: { windowMs: 15 * MINUTE, limit: 10 }, // FAILED attempts per IP + identifier
  loginIp: { windowMs: 15 * MINUTE, limit: 50 }, // per IP, any identifier
  refresh: { windowMs: 5 * MINUTE, limit: 60 },
  passwordReset: { windowMs: 60 * MINUTE, limit: 5 },
  register: { windowMs: 60 * MINUTE, limit: 10 },
  sensitive: { windowMs: 15 * MINUTE, limit: 20 }, // password change, email resend
  upload: { windowMs: 15 * MINUTE, limit: 120 }, // per staff member (image processing is CPU-heavy)
  barcodeGenerate: { windowMs: 15 * MINUTE, limit: 120 }, // per staff member
});
