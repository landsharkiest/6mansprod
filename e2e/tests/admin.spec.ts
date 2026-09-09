import { test, expect, devLogin } from '../support/fixtures';

test('admin sees the Review nav link and the Reports tab', async ({ page }) => {
  await devLogin(page, 'admin');

  await page.goto('/');
  const reviewLink = page.getByRole('link', { name: 'Review' });
  await expect(reviewLink).toBeVisible();

  await reviewLink.click();
  await expect(page).toHaveURL(/\/admin$/);

  const reportsTab = page.getByRole('tab', { name: 'Reports' });
  await expect(reportsTab).toBeVisible();
  await reportsTab.click();
  await expect(reportsTab).toHaveClass(/active/);
});
