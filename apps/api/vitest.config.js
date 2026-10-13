import { defineConfig } from 'vitest/config';

// Deterministic, test-only environment (core/config.js validates at import time).
// Mongo-backed tests start an in-memory replica set (test/mongo.js); Redis-backed tests run only
// when TEST_REDIS_URL is set (CI provides a Redis service).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'test/**/*.test.js'],
    testTimeout: 20_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://127.0.0.1:1/unused-in-tests',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:1',
      API_PUBLIC_URL: 'http://localhost:4000',
      STOREFRONT_URL: 'http://localhost:3000',
      ADMIN_URL: 'http://localhost:5173',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
      MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    },
  },
});
