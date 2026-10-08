import { z } from 'zod';

/**
 * Environment configuration — validated once at startup (fail fast, CLAUDE.md P0.2).
 * Only infrastructure/secrets live here. Business values (VAT, earn rate, currency, …) are
 * admin-editable settings (P0.6), never env vars.
 */

/** Development-only defaults shipped in `.env.example`. Rejected when NODE_ENV=production. */
export const DEV_ONLY_SECRETS = Object.freeze([
  'XMZAAB+O+vT+wBxxt7EB/Nyf3rrZfNgvvR9Tcuozods=',
  'change-me-access-secret-min-32-chars',
  'change-me-refresh-secret-min-32-chars',
]);

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const origin = z.url({ protocol: /^https?$/ }).transform((u) => new URL(u).origin);

const masterKey = z
  .string()
  .min(1, 'MASTER_KEY is required (32 random bytes, base64)')
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'MASTER_KEY must decode to 32 bytes');

const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    LOG_PRETTY: bool.optional(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    /** Number of reverse-proxy hops to trust for client IP (1 behind Nginx). 0 = none. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/)
      .default('1mb'),

    MONGO_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'must start with redis:// or rediss://'),

    API_PUBLIC_URL: z.url(),
    STOREFRONT_URL: z.url(),
    ADMIN_URL: z.url(),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(origin)),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    MASTER_KEY: masterKey,

    TZ_DISPLAY: z.string().refine(isValidTimeZone, 'invalid IANA time zone').default('Asia/Riyadh'),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MASTER_KEY']) {
      if (DEV_ONLY_SECRETS.includes(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'development placeholder is not allowed in production',
        });
      }
    }
  });

/**
 * Parses and validates an env object. Pure — safe to call in tests with a custom object.
 * @param {Record<string, string | undefined>} env
 */
export function loadConfig(env) {
  // Treat empty strings as "not set" so `.env` lines like `LOG_LEVEL=` fall back to defaults.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }

  const c = result.data;
  const isProd = c.NODE_ENV === 'production';
  const isTest = c.NODE_ENV === 'test';
  return Object.freeze({
    ...c,
    CORS_ORIGINS: Object.freeze([...new Set(c.CORS_ORIGINS)]),
    LOG_LEVEL: c.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
    LOG_PRETTY: c.LOG_PRETTY ?? c.NODE_ENV === 'development',
    isProd,
    isTest,
    isDev: c.NODE_ENV === 'development',
  });
}

/** @typedef {ReturnType<typeof loadConfig>} AppConfig */

/** Process-wide config. Throws ConfigError at import time if the environment is invalid. */
export const config = loadConfig(process.env);
