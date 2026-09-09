import { test, expect } from '../support/fixtures';

test('leaderboard tabs switch between daily, endless and blitz', async ({ page }) => {
  await page.goto('/leaderboard');

  const tabs = page.getByRole('tab');
  const dailyTab = tabs.filter({ hasText: 'Daily' });
  const endlessTab = tabs.filter({ hasText: 'Endless' });
  const blitzTab = tabs.filter({ hasText: 'Blitz' });

  await expect(dailyTab).toHaveClass(/active/);

  await endlessTab.click();
  await expect(endlessTab).toHaveClass(/active/);
  await expect(page.getByText('Endless mode runs: consecutive correct guesses.')).toBeVisible();

  await blitzTab.click();
  await expect(blitzTab).toHaveClass(/active/);
  await expect(page.getByText('Top Blitz runs from signed-in players.')).toBeVisible();

  await dailyTab.click();
  await expect(dailyTab).toHaveClass(/active/);
});
