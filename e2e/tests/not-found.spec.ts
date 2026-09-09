import { test, expect } from '../support/fixtures';

test('an unknown route renders the 404 page', async ({ page }) => {
  await page.goto('/this-route-does-not-exist');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  await expect(page.getByText("There's no clip at this address.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back home' })).toBeVisible();
});
