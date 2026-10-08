import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/**
 * Admin SPA. In development the API is reached through Vite's proxy (`/api` → API_PROXY_TARGET),
 * so the browser sees ONE origin — same as production behind Nginx. That keeps the refresh cookie
 * (SameSite=Strict, path /api/v1/auth/staff) and the CSRF Origin check behaving identically.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        // Read-only: storefront UI catalogs, so Settings → Languages can show and correct them.
        '@storefront-i18n': path.resolve(
          import.meta.dirname,
          '../storefront/src/i18n/dictionaries',
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: false },
      },
    },
    // Internal admin SPA (~220 kB gz: React, router, zod, forms). Route-level lazy() splitting is
    // added as feature pages land; the SEO-critical storefront is a separate Next.js app.
    build: { sourcemap: true, chunkSizeWarningLimit: 800 },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      css: false,
    },
  };
});
