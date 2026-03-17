import { test, expect } from '@playwright/test';

test.describe('Panel Visibility', () => {
  test('PW-09: Click panel toggle -> panel appears/disappears', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const panelBtn = page.getByRole('button', { name: /show panel|hide panel/i }).first();
    await expect(panelBtn).toBeVisible({ timeout: 10000 });

    // Get current state
    const initialText = await panelBtn.textContent();
    const isPanelVisible = initialText?.toLowerCase().includes('hide');

    if (isPanelVisible) {
      // Panel is visible, click to hide
      await panelBtn.click();
      await expect(panelBtn).toHaveText(/show panel/i);
      // Verify detail area is gone (no "Overview" heading)
      await expect(page.locator('h3:has-text("Overview")')).not.toBeVisible({ timeout: 3000 });

      // Click again to show
      await panelBtn.click();
      await expect(panelBtn).toHaveText(/hide panel/i);
      await expect(page.locator('text=Overview').first()).toBeVisible({ timeout: 3000 });
    } else {
      // Panel is hidden, click to show
      await panelBtn.click();
      await expect(panelBtn).toHaveText(/hide panel/i);
      await expect(page.locator('text=Overview').first()).toBeVisible({ timeout: 3000 });

      // Click again to hide
      await panelBtn.click();
      await expect(panelBtn).toHaveText(/show panel/i);
    }
  });

  test('PW-10: Click timeline toggle -> timeline section expands/collapses', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const timelineBtn = page.getByRole('button', { name: /show timeline|hide timeline/i }).first();
    await expect(timelineBtn).toBeVisible({ timeout: 10000 });

    const initialText = await timelineBtn.textContent();
    const isTimelineOpen = initialText?.toLowerCase().includes('hide');

    if (isTimelineOpen) {
      // Timeline is open; verify we see timeline content
      await expect(page.locator('text=Timeline').first()).toBeVisible();

      // Click to collapse
      await timelineBtn.click();
      await expect(timelineBtn).toHaveText(/show timeline/i);
      // Collapsed state shows minimal text
      await expect(page.locator('text=Timeline (collapsed)').first()).toBeVisible({ timeout: 3000 });
    } else {
      // Timeline is collapsed; click to expand
      await timelineBtn.click();
      await expect(timelineBtn).toHaveText(/hide timeline/i);
      // Should see timeline controls (Play/Pause button in timeline)
      await expect(page.locator('text=Timeline').first()).toBeVisible({ timeout: 3000 });

      // Click again to collapse
      await timelineBtn.click();
      await expect(timelineBtn).toHaveText(/show timeline/i);
    }
  });
});
