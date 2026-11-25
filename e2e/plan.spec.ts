import { expect, test } from './fixtures';

const column = (page: import('@playwright/test').Page) => page.getByRole('group', { name: 'Panels' });
const titles = (page: import('@playwright/test').Page) =>
  column(page).getByRole('heading', { level: 2 }).allTextContents();

test('planner panels start collapsed, move, persist and reset', async ({ page }) => {
  await page.goto('/plan');
  await expect.poll(() => titles(page)).toEqual(['Thermal overlay', 'XC score', 'Airspace']);
  for (const name of ['Thermal overlay', 'XC score', 'Airspace'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Thermal overlay panel actions' }).click();
  await expect(page.getByRole('menuitem', { name: /^Move to/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Remove' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect.poll(() => titles(page)).toEqual(['XC score', 'Thermal overlay', 'Airspace']);

  await page.reload();
  await expect.poll(() => titles(page)).toEqual(['XC score', 'Thermal overlay', 'Airspace']);

  await page.getByRole('button', { name: 'Airspace', exact: true }).click();
  await page.getByRole('button', { name: 'XC score panel actions' }).click();
  await page.getByRole('menuitem', { name: 'Reset layout' }).click();
  await expect.poll(() => titles(page)).toEqual(['Thermal overlay', 'XC score', 'Airspace']);
  await expect(page.getByRole('button', { name: 'Airspace', exact: true })).toHaveAttribute('aria-expanded', 'false');
});

test('the XC switch turns scoring on and off, legs show with a route', async ({ page }) => {
  await page.goto('/plan?r=' + encodeURIComponent('47,8~47,8.2~47.2,8.2'));
  await expect(page.getByRole('region', { name: 'Legs' })).toBeVisible();

  await page.getByRole('button', { name: 'XC score', exact: true }).click();
  const xc = page.getByRole('region', { name: 'XC score' });
  await expect(xc.getByRole('combobox')).toBeDisabled();
  await expect(xc).not.toContainText(/\d+ points/);

  await xc.getByRole('checkbox', { name: 'Score flights' }).check();
  await expect(xc.getByRole('combobox')).toBeEnabled();
  await expect(xc).toContainText(/\d+ points/, { timeout: 15_000 });

  await xc.getByRole('checkbox', { name: 'Score flights' }).uncheck();
  await expect(xc).not.toContainText(/\d+ points/);
});

test('the route downloads as an XCTrack task', async ({ page }) => {
  await page.goto('/plan?r=' + encodeURIComponent('47,8~47,8.2'));
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'XCTrack task' }).click()
  ]);
  expect(file.suggestedFilename()).toMatch(/\.xctsk$/);
  const task = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(task.turnpoints).toHaveLength(2);
});

test.describe('plugins', () => {
  // The service worker would answer plugin requests itself, bypassing page.route.
  test.use({ serviceWorkers: 'block' });

  const URL = 'https://plugins.example.test/plan-hello.js';
  const plugin = `
    export default {
      id: 'test/plan-hello', name: 'Plan Hello', kind: 'studio', apiVersion: 2, dock: 'right',
      hosts: ['plan'], requires: ['updraft/plan@1'],
      mount(el, ctx) {
        const plan = ctx.use('updraft/plan@1');
        const marker = document.createElement('i');
        marker.dataset.testid = 'plugin-marker';
        ctx.overlay.append(marker);
        const draw = () => { el.textContent = 'points=' + plan.points().length; };
        const stop = plan.on('route', draw);
        draw();
        return () => stop();
      }
    };`;

  test('a plan plugin shows in the planner, can be removed and uninstalled', async ({ page }) => {
    await page.route(URL, (route) =>
      route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: plugin })
    );
    await page.goto('/plan?r=' + encodeURIComponent('47,8~47,8.2'));
    await page.getByRole('button', { name: 'Panels', exact: true }).click();
    await page.getByRole('button', { name: 'Add plugin…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add plugin' });
    await dialog.getByLabel(/^Plugin address/).fill(URL);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => titles(page)).toEqual(['Thermal overlay', 'XC score', 'Airspace', 'Legs', 'Plan Hello']);
    const panel = page.getByRole('region', { name: 'Plan Hello' });
    // Not collapsed, so it is mounted.
    await expect(panel).toContainText('points=2');
    await expect(page.getByTestId('plugin-marker')).toHaveCount(1);

    await page.getByRole('button', { name: 'Plan Hello panel actions' }).click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('plugin-marker')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Airspace', exact: true })).toBeVisible();
    await expect(panel).toHaveCount(0);

    await page.getByRole('button', { name: 'Panels', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Plan Hello' }).check();
    await expect(panel).toContainText('points=2');

    // The menu stays open.
    await page.getByRole('button', { name: 'Uninstall plugin Plan Hello' }).click();
    await expect(panel).toHaveCount(0);
    await page.reload();
    await page.getByRole('button', { name: 'Panels', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Plan Hello' })).toHaveCount(0);
  });
});
