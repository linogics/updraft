import { expect, test } from './fixtures';

// The service worker would answer plugin requests itself, bypassing page.route.
test.use({ serviceWorkers: 'block' });

const URL = 'https://plugins.example.test/csvtrack.js';
const body = `
  export default {
    id: 'test/csvtrack', name: 'CSV track', kind: 'converter', apiVersion: 1,
    label: 'CSV track', extensions: ['csvtrack'],
    read: () => ({ date: '2024-01-01', fixes: [{ t: 0, lat: 1, lon: 1, alt: 1 }] })
  };`;

test('converter plugins are added and removed on the converter page', async ({ page }) => {
  await page.route(URL, (route) =>
    route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body })
  );
  await page.goto('/convert');
  const formats = page.getByRole('region', { name: 'Formats' });
  await expect(formats.getByRole('listitem').filter({ hasText: '.igc' })).toContainText('Built in');
  await expect(formats.getByRole('button', { name: /^Uninstall/ })).toHaveCount(0);

  await formats.getByRole('button', { name: 'Add format' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add plugin' });
  await dialog.getByLabel(/^Plugin address/).fill(URL);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(formats.getByRole('listitem').filter({ hasText: '.csvtrack' })).toContainText('Reads');

  await formats.getByRole('button', { name: 'Uninstall plugin CSV track' }).click();
  await expect(formats.getByText('.csvtrack')).toHaveCount(0);
});
