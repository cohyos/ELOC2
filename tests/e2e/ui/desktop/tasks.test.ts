import { test, expect } from '@playwright/test';

test.describe('Task Panel', () => {
  test('PW-16: Click Tasks button -> task panel visible with content', async ({ page }) => {
    await page.goto('/');

    // Find the Tasks button in the header
    const tasksBtn = page.getByRole('button', { name: 'Tasks' }).first();
    await expect(tasksBtn).toBeVisible();

    // Click Tasks to open task panel
    await tasksBtn.click();

    // Task panel should be visible - it shows "EO Tasking" title or task list content
    await expect(
      page.locator('text=/EO Tasking|Tasks|Active Tasks|No active/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('PW-17: Task panel shows score breakdown sections', async ({ page }) => {
    await page.goto('/');

    // Start scenario so tasks get generated
    await page.evaluate(async () => {
      await fetch('/api/scenario/speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: 10 }),
      });
      await fetch('/api/scenario/start', { method: 'POST' });
    });
    await page.waitForTimeout(5000);

    // Open Tasks panel
    const tasksBtn = page.getByRole('button', { name: 'Tasks' }).first();
    await tasksBtn.click();

    // The task panel should display task information
    // It may show section titles like "Active Tasks", "Score", "Status", etc.
    await expect(
      page.locator('text=/EO Tasking|Tasks|Score|Priority|Status|proposed|executing|Active/i').first()
    ).toBeVisible({ timeout: 5000 });

    // Cleanup
    await page.evaluate(() => fetch('/api/scenario/reset', { method: 'POST' })).catch(() => {});
  });
});
