import { test, expect } from '@playwright/test';

test.describe('Page Load', () => {
  test('PW-01: Page loads successfully', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/ELOC2/i);
  });

  test('PW-02: Header elements render', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    // Check logo
    await expect(page.locator('text=ELOC2').first()).toBeVisible({ timeout: 10000 });
    // Check scenario dropdown
    await expect(page.locator('select').first()).toBeVisible({ timeout: 10000 });
    // Check play button
    await expect(page.getByRole('button', { name: /start|play/i })).toBeVisible({ timeout: 10000 });
    // Check WS indicator
    await expect(page.locator('[class*="ws"], [data-testid="ws-indicator"], :text("Connected"), :text("Disconnected")').first()).toBeVisible({ timeout: 15000 });
  });

  test('PW-03: Map canvas renders', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  });
});
