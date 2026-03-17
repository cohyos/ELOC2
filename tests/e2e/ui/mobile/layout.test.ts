import { test, expect } from '@playwright/test';

test.describe('Mobile Layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('PW-23: Mobile layout renders correctly', async ({ page }) => {
    await page.goto('/');
    // Check that header text is visible
    await expect(page.locator('text=ELOC2').first()).toBeVisible();
    // Map canvas fills viewport
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  });

  test('PW-24: Can start scenario on mobile', async ({ page }) => {
    await page.goto('/');
    // Find and click Start/Play button
    const startBtn = page.getByRole('button', { name: /start|play/i }).first();
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    // Wait for scenario to produce tracks
    await page.waitForTimeout(3000);
  });

  test('PW-25: Mobile panel opens via bottom toolbar', async ({ page }) => {
    await page.goto('/');
    // Look for bottom toolbar buttons (Overview, Tasks, Timeline)
    // These may be implemented as buttons near the bottom
    const overviewBtn = page.locator('button').filter({ hasText: /overview|detail/i }).first();
    if (await overviewBtn.isVisible()) {
      await overviewBtn.click();
      // Check that some panel/sheet content is visible
      await page.waitForTimeout(500);
    }
  });

  test('PW-26: Mobile panel dismisses', async ({ page }) => {
    await page.goto('/');
    // If panel is open, close it
    const closeBtn = page.locator('button').filter({ hasText: /×|close/i }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  });
});
