import { test as base, expect } from '@playwright/test';

/**
 * Every test gets a page that already has the "how to play" modal marked seen (Layout.tsx
 * auto-opens it on a first-ever visit to certain routes, keyed off this localStorage flag) — an
 * init script runs before any navigation, so it's set before the app's own effect checks it.
 * Without this, the modal would cover the rank picker on a fresh browser context and every click
 * test would need to dismiss it first.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('sixmansdle.seenHowToPlay', '1');
      } catch {
        /* storage unavailable in this context; the modal just shows once, harmless */
      }
    });
    await use(page);
  },
});

export { expect };

/**
 * Logs in via the API's dev-only route (no Discord needed) and waits for the app to reflect it.
 *
 * The API redirects to "/?login=ok", but AuthContext strips that query marker with
 * history.replaceState almost immediately after mount — matching on it via waitForURL is a race
 * that sometimes loses, so wait on the pathname (which never changes) instead.
 */
export async function devLogin(page: import('@playwright/test').Page, as: 'player' | 'admin' = 'player') {
  await page.goto(`/api/auth/dev-login?as=${as}`);
  await page.waitForURL((url) => url.pathname === '/');
}
