import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';

/**
 * Structured logger (pino). Rule: never log PII or secrets (CLAUDE.md §2.5).
 * Request bodies and headers are not logged at all; the paths below are a safety net for
 * objects passed explicitly, e.g. `logger.info({ user }, '...')`.
 */
const REDACT_PATHS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.authorization',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'api', env: config.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  // pino-pretty is a devDependency: only used when explicitly pretty (development default).
  transport: config.LOG_PRETTY
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
        },
      }
    : undefined,
});

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;
const QUIET_PATHS = new Set(['/api/v1/health', '/api/v1/health/ready']);

/**
 * Per-request logger + request id. Reuses a well-formed incoming `X-Request-Id` (from Nginx or a
 * client) so logs correlate across services; otherwise generates one. Echoed in the response.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url?.split('?')[0]) },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    // Path only: query strings may carry PII (e.g. order lookup by phone). No headers.
    req: (req) => ({
      id: req.id,
      method: req.method,
      path: req.url?.split('?')[0],
      // `raw.ip` honours Express 'trust proxy' (real client IP behind Nginx).
      ip: req.raw?.ip ?? req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
