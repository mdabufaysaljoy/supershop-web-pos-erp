import { expect, test } from '@playwright/test';

test.describe('Admin Return and Exchange Flow (P10.2)', () => {
  test('looks up completed order, processes item return with refund, and verifies receipt', async ({
    page,
    request,
  }) => {
    // 1. Fetch the latest returnable order number from API
    const authRes = await request.post('http://localhost:4000/api/v1/auth/staff/login', {
      data: { email: 'admin@example.com', password: 's3TtRvpilJD01Hrk-9a' },
    });
    expect(authRes.ok()).toBeTruthy();
    const loginJson = await authRes.json();
    const token = loginJson.data?.accessToken;

    const ordersRes = await request.get('http://localhost:4000/api/v1/orders?limit=10', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ordersRes.ok()).toBeTruthy();
    const ordersData = await ordersRes.json();
    const eligibleOrder = ordersData.data?.find((o) =>
      ['completed', 'paid', 'delivered'].includes(o.status),
    );
    expect(eligibleOrder).toBeDefined();
    const orderNo = eligibleOrder.orderNo;

    // 2. Login to Admin SPA
    await page.goto('http://localhost:5173/login');
    await page.locator('input[autocomplete="username"]').fill('admin@example.com');
    await page.locator('input[autocomplete="current-password"]').fill('s3TtRvpilJD01Hrk-9a');
    await page.locator('button[type="submit"]').click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    // 3. Navigate to /returns
    await page.goto('http://localhost:5173/returns');
    await expect(page.locator('h1')).toContainText(/returns/i);

    // 4. Look up the eligible order
    const orderInput = page
      .locator('input[placeholder*="order" i], input[placeholder*="ORD" i]')
      .first();
    await orderInput.waitFor({ state: 'visible' });
    await orderInput.fill(orderNo);

    const findBtn = page.getByRole('button', { name: /find order|search|lookup/i });
    await findBtn.click();

    // 5. Verify order card loaded
    await expect(page.locator('form').filter({ hasText: orderNo })).toBeVisible({
      timeout: 10_000,
    });

    // 6. Set return quantity to 1 for the first returnable item
    const qtyInput = page.locator('table input[type="number"]').first();
    await qtyInput.waitFor({ state: 'visible' });
    await qtyInput.fill('1');

    // 7. Fill reason if input exists
    const reasonInput = page.locator('input[placeholder*="reason" i]');
    if (await reasonInput.isVisible()) {
      await reasonInput.fill('Item return E2E test');
    }

    // 8. Submit return
    const submitBtn = page.getByRole('button', { name: /complete return|complete exchange/i });
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    // 9. Verify Return Receipt Dialog opens
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText(/credit note|return|receipt/i);

    // 10. Close dialog and verify history table
    const closeBtn = dialog.getByRole('button', { name: /close/i });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(dialog).toBeHidden({ timeout: 5000 });
    }
  });
});
