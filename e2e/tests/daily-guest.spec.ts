import { test, expect } from '../support/fixtures';

test('guest can play the daily and sees a verdict plus the distribution chart', async ({ page }) => {
  await page.goto('/daily');

  // Wait for the clip + rank picker to load before guessing.
  const rankGroup = page.getByRole('group', { name: 'Guess the rank' });
  await expect(rankGroup).toBeVisible();

  await page.getByRole('button', { name: 'Guess rank A' }).click();

  // The verdict is a role="status" live region — "Correct!" or an off-by message. Scoped to
  // ".verdict" rather than the bare role, since the clip player briefly shows its own
  // role="status" loading overlay too.
  const verdict = page.locator('.verdict[role="status"]');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText(/Correct!|off|Not this time/);

  await expect(page.getByText('How everyone guessed')).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toBeVisible();
});
