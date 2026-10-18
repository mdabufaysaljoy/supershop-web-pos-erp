import { expect, test } from '@playwright/test';

test.describe('POS Counter Sale Flow (P10.2)', () => {
  test('logs in, opens shift if needed, rings up sale with exact cash tender', async ({ page }) => {
    // 1. Login as super-admin
    await page.goto('http://localhost:5173/login');
    await page.locator('input[autocomplete="username"]').fill('admin@example.com');
    await page.locator('input[autocomplete="current-password"]').fill('s3TtRvpilJD01Hrk-9a');
    await page.locator('button[type="submit"]').click();

    // 2. Wait for login to complete and navigate to /pos
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
    await page.goto('http://localhost:5173/pos');
    await expect(page.locator('h1')).toContainText(/till|pos|point of sale/i);

    // 3. Ensure branch is selected
    const branchSelect = page.locator('select').first();
    if (await branchSelect.isVisible()) {
      const val = await branchSelect.inputValue();
      if (!val) {
        const firstOption = await branchSelect
          .locator('option:not([value=""])')
          .first()
          .getAttribute('value');
        if (firstOption) {
          await branchSelect.selectOption(firstOption);
        }
      }
    }

    // 4. Open shift if no active shift
    const openShiftBtn = page.getByRole('button', { name: /open shift/i });
    if (await openShiftBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openShiftBtn.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      const cashInput = dialog.locator('input[type="text"]').first();
      if (await cashInput.isVisible()) {
        await cashInput.fill('100');
      }
      await dialog.locator('button[type="submit"]').click();
      await expect(dialog).toBeHidden({ timeout: 5000 });
    }

    // 5. Search for an item and add to sale
    const tillSearch = page.locator('#till-search');
    await tillSearch.waitFor({ state: 'visible' });
    await tillSearch.fill('Oxford');

    const resultItem = page
      .locator('ul button')
      .filter({ hasText: /Oxford/i })
      .first();
    await resultItem.waitFor({ state: 'visible', timeout: 5000 });
    await resultItem.click();

    // 6. Tender exact cash
    const exactBtn = page.getByRole('button', { name: /exact/i });
    await expect(exactBtn).toBeVisible({ timeout: 5000 });
    await expect(exactBtn).toBeEnabled({ timeout: 5000 });
    await exactBtn.click();

    // 7. Complete sale
    const completeBtn = page.getByRole('button', { name: /complete sale|ring up/i });
    await expect(completeBtn).toBeEnabled({ timeout: 5000 });
    await completeBtn.click();

    // 8. Verify success alert displayed with order number
    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/sale rung up|order|change/i);
  });
});
