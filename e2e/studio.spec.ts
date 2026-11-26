import { readFileSync } from 'node:fs';

import type { Page } from '@playwright/test';

import { buildIgc } from '../src/lib/domain/testing/igc-builder';
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
  const smooth = page.getByRole('region', { name: 'Track' }).getByRole('checkbox', { name: 'Smooth' });
  await expect(smooth).toBeChecked();

  await smooth.uncheck();
  await expect(page).toHaveURL(/[?&]smooth=0/);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Track' }).getByRole('checkbox', { name: 'Smooth' })).not.toBeChecked();
});

test('airspaces need a key, are on by default with one and stay on after reload', async ({ page }) => {
  await openDemoStudio(page);
  const region = page.getByRole('region', { name: 'Airspace' });
  await region.getByRole('button', { name: 'Airspace', exact: true }).click();
  await expect(region.getByRole('checkbox', { name: 'Airspaces' })).toBeDisabled();

  await region.getByLabel('openAIP key').fill('test-key');
  await page.keyboard.press('Tab');
  await expect(region.getByRole('checkbox', { name: 'Airspaces' })).toBeEnabled();
  await expect(region.getByRole('checkbox', { name: 'Airspaces' })).toBeChecked();

  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Airspace' }).getByRole('checkbox', { name: 'Airspaces' })
  ).toBeChecked();
});

test('removing the thermal overlay panel turns it off, adding it turns it on', async ({ page }) => {
  await openDemoStudio(page);
  await page.getByRole('button', { name: /^Panels/ }).click();
  const panelSwitch = page.getByRole('checkbox', { name: 'Thermal overlay' });
  await panelSwitch.uncheck();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('thermalOverlayPrefs') ?? 'null'));
  expect((await stored()).enabled).toBe(false);

  await panelSwitch.check();
  await page.keyboard.press('Escape');
  const region = page.getByRole('region', { name: 'Thermal overlay' });
  await region.getByRole('button', { name: 'Thermal overlay', exact: true }).click();
  await expect(region.getByRole('checkbox', { name: 'Show thermal overlay' })).toBeChecked();
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
  await expect(page.locator('aside').getByRole('region', { name: 'Stats' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stats panel actions' })).toBeFocused();
  await expect(page.getByText('Stats moved to left dock, position 3')).toBeAttached();
});

test('the Stats plugin follows the selected pilot', async ({ page }) => {
  await openDemoStudio(page);
  const stats = page.locator('aside').getByRole('region', { name: 'Stats' });
  await expect(stats).toContainText('Duration');
  const before = await stats.innerText();
  await page.locator('button.name').nth(1).click();

  await expect(stats).not.toHaveText(before);
});

/** Hides the XC panel, so scoring neither moves the panels nor competes for the CPU during a drag. */
const withoutXc = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('studioLayout', JSON.stringify({ hidden: ['plugin:updraft/xc'] })));

test('dragging Stats by its handle into the left dock moves it there', async ({ page }) => {
  await withoutXc(page);
  await openDemoStudio(page);
  const grip = (await page.getByRole('button', { name: 'Drag Stats' }).boundingBox())!;
  const left = (await page.getByRole('navigation', { name: 'Outliner' }).boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x - 40, grip.y + 40, { steps: 5 });
  await page.mouse.move(left.x + left.width / 2, left.y + left.height - 20, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByRole('navigation', { name: 'Outliner' }).getByRole('region', { name: 'Stats' })).toBeVisible();
  await expect(page.locator('aside').getByRole('region', { name: 'Stats' })).toHaveCount(0);
  await expect(page.getByText('Stats moved to left dock, position 3')).toBeAttached();
});

test('dragging the Altitude tab after the Timeline tab reorders the tabs', async ({ page }) => {
  await withoutXc(page);
  await openDemoStudio(page);
  const tabs = page.getByRole('tablist', { name: 'Bottom panel' }).getByRole('tab');
  await expect(tabs).toHaveText(['Altitude', 'Timeline']);
  const alt = (await tabs.first().boundingBox())!;
  const timeline = (await tabs.nth(1).boundingBox())!;
  await page.mouse.move(alt.x + alt.width / 2, alt.y + alt.height / 2);
  await page.mouse.down();
  await page.mouse.move(alt.x + alt.width / 2 + 10, alt.y + alt.height / 2, { steps: 3 });
  // A placeholder keeps the lifted tab's place, so the Timeline tab stays where it was.
  await expect(page.locator('.slot')).toHaveCount(1);
  expect((await tabs.nth(1).boundingBox())!.x).toBe(timeline.x);
  await page.mouse.move(timeline.x + timeline.width - 4, timeline.y + timeline.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(tabs).toHaveText(['Timeline', 'Altitude']);
});

test('hidden XC and Pilots panels cost nothing, showing XC starts scoring', async ({ page }) => {
  // Scoring runs in one worker per flight.
  const workers: string[] = [];
  page.on('worker', (w) => {
    if (/score\.worker/.test(w.url())) workers.push(w.url());
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('studioLayout')) {
      localStorage.setItem('studioLayout', JSON.stringify({ hidden: ['plugin:updraft/xc', 'plugin:updraft/pilots'] }));
    }
  });
  await openDemoStudio(page);
  await expect(page.getByRole('region', { name: 'Stats' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'XC' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'XC league' })).toHaveCount(0);
  // eslint-disable-next-line playwright/no-wait-for-timeout -- must wait to prove no worker ever spawns
  await page.waitForTimeout(3000);
  expect(workers).toEqual([]);

  await page.getByRole('button', { name: /^Panels/ }).click();
  await page.getByRole('checkbox', { name: 'XC' }).check();
  // The panel starts collapsed. Close the menu so it does not cover the panel.
  await page.keyboard.press('Escape');
  await page.getByRole('region', { name: 'XC' }).getByRole('button', { name: 'XC', exact: true }).click();
  const league = page.getByRole('combobox', { name: 'XC league' });
  await expect(league).toBeVisible();
  // Showing the panel starts scoring.
  await expect.poll(() => workers.length, { timeout: 30_000 }).toBeGreaterThan(0);
});

/** A short synthetic flight of a pilot who is not in the demo. */
const newFlight = () => ({
  name: 'added.igc',
  mimeType: 'text/plain',
  buffer: Buffer.from(
    buildIgc(
      Array.from({ length: 120 }, (_, i) => ({
        sec: 36_000 + i * 5,
        lat: 46.5 + i * 1e-4,
        lon: 8.1,
        gpsAlt: 1500 + i
      })),
      { pilot: 'Added Pilot', date: '010826' }
    )
  )
});

const pilotRows = (page: Page) => page.getByRole('checkbox', { name: /^Show / });
const flightIds = (page: Page) => new URL(page.url()).searchParams.getAll('f');

test('the picker imports a flight and adds it to the studio', async ({ page }) => {
  await openDemoStudio(page);
  const before = await pilotRows(page).count();
  const ids = flightIds(page).length;

  await page.getByRole('button', { name: 'Add pilot' }).click();
  const picker = page.getByRole('dialog', { name: 'Add pilots' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('searchbox', { name: /Filter/ })).toBeFocused();
  // Demo flights are already in the studio, so they are locked.
  await expect(picker.getByRole('checkbox', { checked: true, disabled: true }).first()).toBeVisible();

  await picker.locator('input[type=file]').setInputFiles(newFlight());
  const added = picker.getByRole('checkbox', { name: /Added Pilot/ });
  await expect(added).toBeChecked();

  await picker.getByRole('searchbox').fill('nobody');
  await expect(picker.getByText('No stored flights match.')).toBeVisible();
  await picker.getByRole('searchbox').fill('added');
  await picker.getByRole('button', { name: 'Add (1)' }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add pilot' })).toBeFocused();

  await expect(pilotRows(page)).toHaveCount(before + 1);
  await expect(page.getByRole('checkbox', { name: 'Show Added Pilot' })).toBeVisible();
  await expect.poll(() => flightIds(page).length).toBe(ids + 1);
});

test('dropping a track file on the studio adds the pilot', async ({ page }) => {
  await openDemoStudio(page);
  const before = await pilotRows(page).count();
  const file = newFlight();
  const data = await page.evaluateHandle(
    ({ name, text }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'text/plain' }));
      return dt;
    },
    { name: file.name, text: file.buffer.toString() }
  );

  const body = page.locator('body');
  await body.dispatchEvent('dragenter', { dataTransfer: data });
  await body.dispatchEvent('dragover', { dataTransfer: data });
  await expect(page.getByText('Drop to add pilots')).toBeVisible();

  await body.dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByText('Drop to add pilots')).toBeHidden();
  await expect(page.getByRole('checkbox', { name: 'Show Added Pilot' })).toBeVisible();
  await expect(pilotRows(page)).toHaveCount(before + 1);
});

test('a drag without files does not show the drop overlay', async ({ page }) => {
  await openDemoStudio(page);
  const data = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    return dt;
  });
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await expect(page.getByText('Drop to add pilots')).toBeHidden();
});

test.describe('plugins', () => {
  // The service worker would answer plugin requests itself, bypassing page.route.
  test.use({ serviceWorkers: 'block' });

  const URL = 'https://plugins.example.test/hello.js';
  const plugin = (over = '') => `
    export default {
      id: 'test/hello', name: 'Hello', kind: 'studio', apiVersion: 2, dock: 'right',
      requires: ['updraft/studio@1'],
      mount(el, ctx) {
        const studio = ctx.use('updraft/studio@1');
        const marker = document.createElement('i');
        marker.dataset.testid = 'plugin-marker';
        ctx.overlay.append(marker);
        const draw = () => {
          const f = studio.flights().find((x) => x.id === studio.selectedId());
          el.textContent = 'pilot=' + f.pilot + ' time=' + studio.time();
        };
        const stops = [studio.on('time', draw), studio.on('selection', draw)];
        draw();
        return () => stops.forEach((s) => s());
      },
      ${over}
    };`;

  async function serve(page: Page, body: string) {
    await page.route(URL, (route) =>
      route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body })
    );
  }

  async function add(page: Page) {
    await page.getByRole('button', { name: /^Panels/ }).click();
    await page.getByRole('button', { name: 'Add plugin…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add plugin' });
    await expect(dialog.getByText('A plugin runs with full access to this page and your flights.')).toBeVisible();
    await dialog.getByLabel(/^Plugin address/).fill(URL);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    return dialog;
  }

  test('a plugin added by URL shows its panel, follows playback, unmounts when hidden and can be uninstalled', async ({
    page
  }) => {
    // Two studio loads and a reload.
    test.slow();
    await openDemoStudio(page);
    await serve(page, plugin());
    const dialog = await add(page);
    await expect(dialog).toBeHidden();

    const panel = page.getByRole('region', { name: 'Hello' });
    await expect(panel).toContainText(/pilot=.+ time=\d+/);
    await expect(page.getByTestId('plugin-marker')).toHaveCount(1);

    const before = await panel.textContent();
    await page.keyboard.press('ArrowRight');
    await expect(panel).not.toHaveText(before!);

    await page.getByRole('button', { name: /^Panels/ }).click();
    await page.getByRole('checkbox', { name: 'Hello' }).uncheck();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('plugin-marker')).toHaveCount(0);

    await page.getByRole('checkbox', { name: 'Hello' }).check();
    await expect(page.getByTestId('plugin-marker')).toHaveCount(1);

    await page.reload();
    await expect(panel).toContainText('pilot=', { timeout: 30_000 });

    await page.getByRole('button', { name: /^Panels/ }).click();
    await page.getByRole('button', { name: 'Uninstall plugin Hello' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('plugin-marker')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Outliner' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Panels/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Hello' })).toHaveCount(0);
  });

  test('the bundled example plugin shows the selected pilot', async ({ page }) => {
    await openDemoStudio(page);
    await page.getByRole('button', { name: /^Panels/ }).click();
    await page.getByRole('button', { name: 'Add plugin…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add plugin' });
    await dialog.getByLabel(/^Plugin address/).fill(new globalThis.URL('/plugins/example.js', page.url()).href);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toBeHidden();

    const pilot = await pilotRows(page).first().getAttribute('aria-label');
    await expect(page.getByRole('region', { name: 'Example' })).toContainText(pilot!.replace(/^Show /, ''));
  });

  test('a plugin with an unsupported apiVersion is rejected inline', async ({ page }) => {
    await openDemoStudio(page);
    await serve(page, plugin().replace('apiVersion: 2', 'apiVersion: 3'));
    const dialog = await add(page);
    await expect(dialog.getByRole('alert')).toContainText('Unsupported apiVersion 3');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('region', { name: 'Hello' })).toHaveCount(0);
  });

  test('a plugin whose mount throws shows an error in its panel only', async ({ page }) => {
    await openDemoStudio(page);
    await serve(page, plugin().replace('mount(el, ctx) {', "mount(el, ctx) { throw new Error('boom');"));
    await add(page);

    await expect(page.getByRole('region', { name: 'Hello' }).getByRole('alert')).toContainText('boom');
    await expect(page.getByRole('region', { name: 'Stats' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hello' }).getByRole('alert')).toBeVisible();
  });

  test('a plugin draws into the image export and can be switched off', async ({ page }) => {
    test.slow();
    await openDemoStudio(page);
    await serve(page, plugin(`drawExport(c) { c.fillStyle = '#ff00ff'; c.fillRect(0, 0, 20, 20); }`));
    await expect(await add(page)).toBeHidden();
    await expect(page.getByRole('region', { name: 'Hello' })).toContainText('pilot=');

    await page.getByRole('region', { name: 'Export' }).getByRole('button', { name: 'Export', exact: true }).click();
    const box = page.getByRole('region', { name: 'Export' }).getByRole('checkbox', { name: 'Hello' });
    await expect(box).toBeChecked();

    const corner = async () => {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download PNG' }).click();
      const bytes = [...readFileSync((await (await download).path())!)];
      return page.evaluate(async (b) => {
        const bmp = await createImageBitmap(new Blob([new Uint8Array(b)]));
        const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
        c.drawImage(bmp, 0, 0);
        return [...c.getImageData(5, 5, 1, 1).data.slice(0, 3)];
      }, bytes);
    };

    expect(await corner()).toEqual([255, 0, 255]);
    await box.uncheck();
    expect(await corner()).not.toEqual([255, 0, 255]);
  });
});
