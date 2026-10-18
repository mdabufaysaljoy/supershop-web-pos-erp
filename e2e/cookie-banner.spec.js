import { test, expect } from '@playwright/test';

test.describe('Cookie Banner Interaction', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('clicking Accept All hides banner and persists on reload', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const banner = page.locator(
      '[role="region"][aria-label*="privacy" i], [role="region"][aria-label*="cookie" i]',
    );
    await expect(banner).toBeVisible({ timeout: 5000 });

    const acceptBtn = page.getByRole('button', { name: /accept/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    await expect(banner).not.toBeVisible({ timeout: 3000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(banner).not.toBeVisible({ timeout: 2000 });
  });

  test('clicking Necessary Only / Reject hides banner and persists on reload', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const banner = page.locator(
      '[role="region"][aria-label*="privacy" i], [role="region"][aria-label*="cookie" i]',
    );
    await expect(banner).toBeVisible({ timeout: 5000 });

    const necessaryBtn = page.getByRole('button', { name: /necessary only/i });
    await expect(necessaryBtn).toBeVisible();
    await necessaryBtn.click();

    await expect(banner).not.toBeVisible({ timeout: 3000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(banner).not.toBeVisible({ timeout: 2000 });
  });

  test('clicking Close ✕ hides banner and persists on reload', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const banner = page.locator(
      '[role="region"][aria-label*="privacy" i], [role="region"][aria-label*="cookie" i]',
    );
    await expect(banner).toBeVisible({ timeout: 5000 });

    const closeBtn = page.getByRole('button', { name: /close/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    await expect(banner).not.toBeVisible({ timeout: 3000 });

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(banner).not.toBeVisible({ timeout: 2000 });
  });
});
