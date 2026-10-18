import { expect, test } from '@playwright/test';

test.describe('Storefront EN <-> AR Language Switch Flow (P10.2)', () => {
  test('switches language from EN to AR, validates RTL and Arabic content without leaked keys, and switches back', async ({
    page,
  }) => {
    // 1. Visit English Storefront homepage
    await page.goto('http://localhost:3000/');
    const html = page.locator('html');

    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');

    // 2. Click Arabic switcher link
    const arLink = page.locator('a[lang="ar"]');
    await expect(arLink).toBeVisible();
    await arLink.click();

    // 3. Verify URL and HTML attributes updated to Arabic RTL
    await page.waitForURL(/.*\/ar/, { timeout: 10_000 });
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(html).toHaveAttribute('dir', 'rtl');

    // 4. Verify Arabic text is present on the page
    const pageText = await page.locator('body').innerText();
    const hasArabicChars = /[\u0600-\u06FF]/.test(pageText);
    expect(hasArabicChars).toBe(true);

    // 5. Verify no raw translation keys or template markers leaked
    expect(pageText).not.toMatch(/\{t\(|__TRANS/);
    expect(pageText).not.toMatch(/\b(site|nav|catalog|cart|checkout|auth)\.[a-z0-9_.]+\b/i);

    // 6. Switch back to English
    const enLink = page.locator('a[lang="en"]');
    await expect(enLink).toBeVisible();
    await enLink.click();

    // 7. Verify URL and HTML attributes restored to English LTR
    await page.waitForURL((url) => !url.pathname.startsWith('/ar'), { timeout: 10_000 });
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(html).toHaveAttribute('dir', 'ltr');
  });
});
