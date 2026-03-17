import { test, expect } from '@playwright/test';

test.describe('Header Controls', () => {
  test('PW-04: Scenario dropdown has >= 9 options', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    // Wait for scenarios to load from API
    const select = page.locator('select').first();
    await expect(select).toBeVisible({ timeout: 10000 });
    // Wait for options to populate (fetched from /api/scenarios)
    await page.waitForFunction(() => {
      const sel = document.querySelector('select');
      return sel && sel.options.length >= 9;
    }, { timeout: 15000 });
    const optionCount = await select.locator('option').count();
    expect(optionCount).toBeGreaterThanOrEqual(9);
  });

  test('PW-05: Click Start changes button appearance', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const startBtn = page.getByRole('button', { name: /start/i }).first();
    await expect(startBtn).toBeVisible({ timeout: 10000 });

    // Verify initial state shows "Start"
    await expect(startBtn).toHaveText(/start/i);

    // Click Start
    await startBtn.click();
    // Button should change to "Pause" when scenario is running
    await expect(page.getByRole('button', { name: /pause/i }).first()).toBeVisible({ timeout: 5000 });

    // Cleanup: pause the scenario
    await page.getByRole('button', { name: /pause/i }).first().click();
    await fetch('/api/scenario/reset', { method: 'POST' }).catch(() => {});
  });
});
