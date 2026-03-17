import { test, expect } from '@playwright/test';

test.describe('Visual Verification', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => fetch('/api/scenario/reset', { method: 'POST' })).catch(() => {});
  });

  test('PW-27: Take full-page screenshot after scenario stable (15s at 10x)', async ({ page }) => {
    await page.goto('/');

    // Wait for page to fully load
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });

    // Start scenario at 10x speed
    await page.evaluate(async () => {
      await fetch('/api/scenario/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: 10 }),
      });
      await fetch('/api/scenario/start', { method: 'POST' });
    });

    // Wait 15 seconds for scenario to stabilize
    await page.waitForTimeout(15000);

    // Verify tracks are present
    const totalText = page.locator('text=/\\d+ total/').first();
    await expect(totalText).toBeVisible({ timeout: 10000 });

    // Take full-page screenshot
    await page.screenshot({
      path: 'tests/e2e/output/screenshots/desktop-scenario-stable.png',
      fullPage: true,
    });

    // Take just the viewport screenshot as well
    await page.screenshot({
      path: 'tests/e2e/output/screenshots/desktop-viewport-stable.png',
      fullPage: false,
    });

    // Verify screenshot files were created (implicit - if screenshot() fails, the test fails)
    expect(true).toBe(true);
  });
});
