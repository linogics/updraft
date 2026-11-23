import { expect, openDemoReplay, test } from './fixtures';

test('home page uses the Sora display font', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'updraft, all tools' })).toBeVisible();
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/^"?Sora"?,/);
  expect(await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('14px Sora')))).toBe(true);
});

test('demo opens the editor layout: outliner, viewport, inspector and timeline', async ({ page }) => {
  await openDemoReplay(page);
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Altitude' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('separator', { name: 'Outliner' })).toBeVisible();
  await expect(page.getByRole('separator', { name: 'Side panel' })).toBeVisible();
});

test('smooth lines are on by default and stay out of the URL', async ({ page }) => {
  await openDemoReplay(page);
  expect(new URL(page.url()).searchParams.has('smooth')).toBe(false);
  await page.getByRole('button', { name: /^Track/ }).click();
  const smooth = page.getByRole('checkbox', { name: 'Smooth' });
  await expect(smooth).toBeChecked();

  await smooth.uncheck();
  await expect(page).toHaveURL(/[?&]smooth=0/);
  await page.reload();
  await page.getByRole('button', { name: /^Track/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Smooth' })).not.toBeChecked();
});

test('airspaces start hidden, also after they were shown in an earlier session', async ({ page }) => {
  await openDemoReplay(page);
  await page.getByRole('button', { name: /^View/ }).click();
  const show = page.getByRole('checkbox', { name: 'Airspaces' });
  await expect(show).not.toBeChecked();

  await show.check();
  await page.reload();
  await page.getByRole('button', { name: /^View/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Airspaces' })).not.toBeChecked();
});

test('a collapsed outliner stays collapsed after reload', async ({ page }) => {
  await openDemoReplay(page);
  const outliner = page.getByRole('navigation', { name: 'Outliner' });
  await page.getByRole('button', { name: 'Collapse outliner' }).click();
  await expect(outliner).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand outliner' })).toBeVisible({ timeout: 30_000 });
  await expect(outliner).toBeHidden();
  await page.getByRole('button', { name: 'Expand outliner' }).click();
  await expect(outliner).toBeVisible();
});

test('arrow keys resize the outliner from its splitter', async ({ page }) => {
  await openDemoReplay(page);
  const outliner = page.getByRole('navigation', { name: 'Outliner' });
  const before = (await outliner.boundingBox())!.width;
  await page.getByRole('separator', { name: 'Outliner' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await outliner.boundingBox())!.width).toBe(before + 32);
});

test('phone layout stacks the panels without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoReplay(page);
  await expect(page.locator('aside')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBe(0);
});
