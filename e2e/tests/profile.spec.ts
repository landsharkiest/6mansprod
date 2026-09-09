import { test, expect, devLogin } from '../support/fixtures';

test('profile page shows the activity calendar and achievements section', async ({ page }) => {
  await devLogin(page, 'player');
  await page.goto('/profile');

  await expect(page.getByRole('img', { name: 'Activity calendar' })).toBeVisible();
  await expect(page.getByText(/^Achievements/)).toBeVisible();
});
