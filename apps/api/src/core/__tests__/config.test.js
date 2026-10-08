import { describe, expect, it } from 'vitest';
import { ConfigError, DEV_ONLY_SECRETS, loadConfig } from '../config.js';

const base = {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27017/x?directConnection=true',
  REDIS_URL: 'redis://127.0.0.1:6379',
  API_PUBLIC_URL: 'http://localhost:4000',
  STOREFRONT_URL: 'http://localhost:3000',
  ADMIN_URL: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:3000, http://localhost:5173/ ,http://localhost:3000',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('loadConfig', () => {
  it('parses a valid env with defaults and normalized CORS origins', () => {
    const c = loadConfig(base);
    expect(c.API_PORT).toBe(4000);
    expect(c.TZ_DISPLAY).toBe('Asia/Riyadh');
    expect(c.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(c.isDev).toBe(true);
    expect(c.LOG_LEVEL).toBe('debug');
    expect(Object.isFrozen(c)).toBe(true);
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...base, API_PORT: '', LOG_LEVEL: '' }).API_PORT).toBe(4000);
  });

  it('reports every invalid field', () => {
    let err;
    try {
      loadConfig({ ...base, MONGO_URI: 'postgres://x', MASTER_KEY: 'short', API_PORT: 'abc' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.message).toMatch(/MONGO_URI/);
    expect(err.message).toMatch(/MASTER_KEY/);
    expect(err.message).toMatch(/API_PORT/);
  });

  it('rejects an invalid CORS origin and time zone', () => {
    expect(() => loadConfig({ ...base, CORS_ORIGINS: 'javascript:alert(1)' })).toThrow(
      /CORS_ORIGINS/,
    );
    expect(() => loadConfig({ ...base, TZ_DISPLAY: 'Mars/Base' })).toThrow(/TZ_DISPLAY/);
  });

  it('requires distinct JWT secrets', () => {
    expect(() => loadConfig({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('rejects development placeholder secrets in production only', () => {
    const devEnv = {
      ...base,
      MASTER_KEY: DEV_ONLY_SECRETS[0],
      JWT_ACCESS_SECRET: DEV_ONLY_SECRETS[1],
    };
    expect(() => loadConfig(devEnv)).not.toThrow();
    expect(() => loadConfig({ ...devEnv, NODE_ENV: 'production' })).toThrow(/production/);
  });

  it('production defaults: info logs, no pretty printing', () => {
    const c = loadConfig({ ...base, NODE_ENV: 'production' });
    expect(c.LOG_LEVEL).toBe('info');
    expect(c.LOG_PRETTY).toBe(false);
  });
});
