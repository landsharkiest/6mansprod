import { test, expect } from '../support/fixtures';

test('home renders and the daily chip appears', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /6mansdle/i })).toBeVisible();
  await expect(page.getByText(/Today's daily: #\d+/)).toBeVisible();
  await expect(page.getByRole('link', { name: "Play today's daily" })).toBeVisible();
});
