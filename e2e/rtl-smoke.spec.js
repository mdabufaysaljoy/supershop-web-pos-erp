/* global window, document */
import { expect, test } from '@playwright/test';

test.describe('RTL Layout Smoke Tests (P10.2)', () => {
  const viewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Mobile', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    test(`Storefront Homepage: RTL direction and zero horizontal overflow on ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:3000/ar');

      const html = page.locator('html');
      await expect(html).toHaveAttribute('dir', 'rtl');
      await expect(html).toHaveAttribute('lang', 'ar');

      // Check computed CSS direction property
      const direction = await page.evaluate(
        () => window.getComputedStyle(document.documentElement).direction,
      );
      expect(direction).toBe('rtl');

      // Verify no horizontal overflow (scrollWidth should not exceed viewport width)
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });

    test(`Storefront Product Page: RTL direction and zero horizontal overflow on ${vp.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('http://localhost:3000/ar/product/oxford-shirt');

      const html = page.locator('html');
      await expect(html).toHaveAttribute('dir', 'rtl');

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });
  }

  test('Storefront Cart Page: RTL layout integrity', async ({ page }) => {
    await page.goto('http://localhost:3000/ar/cart');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
});
