import { test, expect, devLogin } from '../support/fixtures';

test('blitz start screen leads into a running timer', async ({ page }) => {
  // Blitz requires an account (POST /api/blitz/start is behind requireAuth).
  await devLogin(page, 'player');
  await page.goto('/blitz');

  await expect(page.getByText('90 seconds. As many clips as you can guess. Speed pays.')).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();

  await expect(page.getByText(/^Time\s*\d+s$/)).toBeVisible();
});
