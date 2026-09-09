import { test, expect, devLogin } from '../support/fixtures';

test('signed-in player can guess in endless mode, sees a run banner, and advances', async ({ page }) => {
  await devLogin(page, 'player');

  await page.goto('/play');
  await expect(page.getByRole('group', { name: 'Guess the rank' })).toBeVisible();

  await page.getByRole('button', { name: 'Guess rank A' }).click();

  await expect(page.locator('.verdict[role="status"]')).toBeVisible();
  // Signed-in endless guesses carry a run banner ("Run N" / "Best run N").
  await expect(page.getByText(/^Run\s*\d+$/)).toBeVisible();

  await page.getByRole('button', { name: 'Next clip' }).click();
  // A fresh round: the rank picker is back and enabled, no verdict showing yet.
  await expect(page.getByRole('group', { name: 'Guess the rank' })).toBeVisible();
  await expect(page.locator('.verdict')).toHaveCount(0);
});
