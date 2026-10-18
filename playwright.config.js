import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration (P10.2).
 * Runs against running local dev servers:
 * - Storefront: http://localhost:3000
 * - Admin SPA: http://localhost:5173
 * - API: http://localhost:4000
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 45_000,
  use: {
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
