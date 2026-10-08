import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws outside React Server Components; tests run server code in Node.
      'server-only': path.resolve(import.meta.dirname, 'src/test/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    env: { SITE_URL: 'https://shop.example' },
  },
});
