import { expect, openDemoStudio, test } from './fixtures';

test('home page uses the Sora display font', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'updraft, all tools' })).toBeVisible();
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/^"?Sora"?,/);
  expect(await page.evaluate(async () => (await document.fonts.ready, document.fonts.check('14px Sora')))).toBe(true);
});

test('demo opens the editor layout: outliner, viewport, inspector and timeline', async ({ page }) => {
  await openDemoStudio(page);
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Altitude' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('separator', { name: 'Outliner' })).toBeVisible();
  await expect(page.getByRole('separator', { name: 'Side panel' })).toBeVisible();
});

test('smooth lines are on by default and stay out of the URL', async ({ page }) => {
  await openDemoStudio(page);
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
  await openDemoStudio(page);
  await page.getByRole('button', { name: /^View/ }).click();
  const show = page.getByRole('checkbox', { name: 'Airspaces' });
  await expect(show).not.toBeChecked();

  await show.check();
  await page.reload();
  await page.getByRole('button', { name: /^View/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Airspaces' })).not.toBeChecked();
});

test('a collapsed outliner stays collapsed after reload', async ({ page }) => {
  await openDemoStudio(page);
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
  await openDemoStudio(page);
  const outliner = page.getByRole('navigation', { name: 'Outliner' });
  const before = (await outliner.boundingBox())!.width;
  await page.getByRole('separator', { name: 'Outliner' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await outliner.boundingBox())!.width).toBe(before + 32);
});

test('phone layout stacks the panels without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStudio(page);
  await expect(page.locator('aside')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBe(0);
});

test('a hidden panel stays hidden after reload and can be shown again', async ({ page }) => {
  await openDemoStudio(page);
  const thermals = page.getByRole('region', { name: 'Climbs & glides' });
  await expect(thermals).toBeVisible();

  await page.getByRole('button', { name: /^Panels/ }).click();
  await page.getByRole('checkbox', { name: 'Climbs & glides' }).uncheck();
  await expect(thermals).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Outliner' })).toBeVisible({ timeout: 30_000 });
  await expect(thermals).toHaveCount(0);

  await page.getByRole('button', { name: /^Panels/ }).click();
  await page.getByRole('checkbox', { name: 'Climbs & glides' }).check();
  await expect(thermals).toBeVisible();
});

test('the actions menu moves Stats to the left dock and keeps focus on it', async ({ page }) => {
  await openDemoStudio(page);
  const stats = page.getByRole('region', { name: 'Stats' });
  await expect(page.locator('aside').getByRole('region', { name: 'Stats' })).toBeVisible();

  await page.getByRole('button', { name: 'Stats panel actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to left dock' }).click();

  await expect(page.getByRole('navigation', { name: 'Outliner' }).getByRole('region', { name: 'Stats' })).toBeVisible();
  await expect(stats).toHaveCount(1);
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stats panel actions' })).toBeFocused();
  await expect(page.getByText('Stats moved to left dock, position 3')).toBeAttached();
});

test('dragging Stats by its handle into the left dock moves it there', async ({ page }) => {
  await openDemoStudio(page);
  const grip = (await page.getByRole('button', { name: 'Drag Stats' }).boundingBox())!;
  const left = (await page.getByRole('navigation', { name: 'Outliner' }).boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 40, grip.y + 40, { steps: 5 });
  await page.mouse.move(left.x + left.width / 2, left.y + left.height - 20, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByRole('navigation', { name: 'Outliner' }).getByRole('region', { name: 'Stats' })).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.getByText('Stats moved to left dock, position 3')).toBeAttached();
});

test('dragging the Altitude tab after the Timeline tab reorders the tabs', async ({ page }) => {
  await openDemoStudio(page);
  const tabs = page.getByRole('tablist', { name: 'Bottom panel' }).getByRole('tab');
  await expect(tabs).toHaveText(['Altitude', 'Timeline']);
  const alt = (await tabs.first().boundingBox())!;
  await page.mouse.move(alt.x + alt.width / 2, alt.y + alt.height / 2);
  await page.mouse.down();
  await page.mouse.move(alt.x + alt.width / 2 + 10, alt.y + alt.height / 2, { steps: 3 });
  // The lifted tab leaves its slot, so the Timeline tab has shifted left.
  const timeline = (await tabs.nth(1).boundingBox())!;
  await page.mouse.move(timeline.x + timeline.width - 4, timeline.y + timeline.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(tabs).toHaveText(['Timeline', 'Altitude']);
});
