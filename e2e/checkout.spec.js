import { expect, test } from '@playwright/test';

test.describe('Storefront Online Checkout Flow (P10.2)', () => {
  test('adds product to cart, proceeds to checkout, and completes order', async ({ page }) => {
    // 1. Visit product page directly
    await page.goto('http://localhost:3000/product/oxford-shirt');
    await expect(page.locator('h1')).toContainText('Oxford Shirt');

    // 2. Click "Add to cart" or "Buy now"
    const buyNowButton = page.locator('button', { hasText: /buy now/i });
    if (await buyNowButton.isVisible()) {
      await buyNowButton.click();
    } else {
      const addBtn = page.locator('button', { hasText: /add to cart/i });
      await addBtn.click();
      await page.goto('http://localhost:3000/checkout');
    }

    // 3. Verify we are on checkout page
    await expect(page).toHaveURL(/.*checkout/);

    // 4. Fill contact and address fields
    const nameInput = page.locator('input[autocomplete="name"]');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill('Faisal Al-Otaibi');

    const phoneInput = page.locator('input[autocomplete="tel"]');
    await phoneInput.fill('0512345678');

    const emailInput = page.locator('input[autocomplete="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('faisal@example.com');
    }

    const continueBtn = page.getByRole('button', { name: /continue/i });
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }

    const streetInput = page.locator('input[autocomplete="street-address"]');
    await streetInput.fill('Olaya Street, Building 42');

    const cityInput = page.locator('input[autocomplete="address-level2"]');
    await cityInput.fill('Riyadh');

    // 5. Select Cash on delivery payment method if not selected
    const codRadio = page.locator('input[type="radio"][name="paymentMethod"]').first();
    if (await codRadio.isVisible()) {
      await codRadio.check();
    }

    // 6. Submit the order
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 7. Verify order confirmation page
    await page.waitForURL(/.*confirmation.*/, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(/find that order/i);
    await expect(page.locator('body')).toContainText(/Thank you for your order/i);
    await expect(page.locator('body')).toContainText(/ORD-\d+/);
  });
});
