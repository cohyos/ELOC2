import { test, expect } from '@playwright/test';

test.describe('Track Display', () => {
  test.afterEach(async ({ page }) => {
    // Reset scenario after each test
    await page.evaluate(() => fetch('/api/scenario/reset', { method: 'POST' })).catch(() => {});
  });

  test('PW-06: Start scenario, wait 5s -> track count in header > 0', async ({ page }) => {
    await page.goto('/');

    // Start the scenario at 10x speed
    await page.evaluate(async () => {
      await fetch('/api/scenario/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: 10 }),
      });
      await fetch('/api/scenario/start', { method: 'POST' });
    });

    // Wait for tracks to appear
    await page.waitForTimeout(5000);

    // Check that track count in header is > 0 ("N total" text)
    const totalText = page.locator('text=/\\d+ total/').first();
    await expect(totalText).toBeVisible({ timeout: 10000 });
    const text = await totalText.textContent();
    const count = parseInt(text?.match(/(\d+)\s*total/)?.[1] ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });

  test('PW-07: Track summary badges are clickable (filter toggle)', async ({ page }) => {
    await page.goto('/');

    // Start scenario
    await page.evaluate(async () => {
      await fetch('/api/scenario/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: 10 }),
      });
      await fetch('/api/scenario/start', { method: 'POST' });
    });
    await page.waitForTimeout(5000);

    // Click on "confirmed" badge to toggle filter
    const confirmedBadge = page.locator('text=confirmed').first();
    await expect(confirmedBadge).toBeVisible({ timeout: 10000 });

    // Get initial opacity
    const initialOpacity = await confirmedBadge.evaluate(el => getComputedStyle(el).opacity);

    // Click to toggle off
    await confirmedBadge.click();

    // The opacity should change (toggle filter)
    const newOpacity = await confirmedBadge.evaluate(el => getComputedStyle(el).opacity);
    expect(newOpacity).not.toBe(initialOpacity);

    // Click again to toggle back
    await confirmedBadge.click();
  });

  test('PW-08: Detail panel shows content when Show Panel is clicked', async ({ page }) => {
    await page.goto('/');

    // Ensure panel toggle button is visible
    const panelBtn = page.getByRole('button', { name: /show panel|hide panel/i }).first();
    await expect(panelBtn).toBeVisible();

    // If panel is hidden, click to show it
    const btnText = await panelBtn.textContent();
    if (btnText?.toLowerCase().includes('show')) {
      await panelBtn.click();
    }

    // Panel should now be visible with overview content
    await expect(page.locator('text=Overview').first()).toBeVisible({ timeout: 5000 });
  });
});
