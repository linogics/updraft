import { expect, type Page, test as base } from '@playwright/test';

// Map tiles, terrain and airspace come from the internet. Block them so tests are offline and stable.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
    await use(page);
  }
});

export { expect };

/** Loads the demo flights from the home page and waits for the studio editor. */
export async function openDemoStudio(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'load demo flights' }).click();
  await page.waitForURL(/\/studio\?/);
  await expect(page.getByRole('navigation', { name: 'Outliner' })).toBeVisible({ timeout: 30_000 });
  // While the page cross-fade runs, every pointer event hits <html>, so pointer tests must wait for it to end.
  // It is active from its start, before its animations exist.
  await page.waitForFunction(() => !(document as { activeViewTransition?: unknown }).activeViewTransition);
}
