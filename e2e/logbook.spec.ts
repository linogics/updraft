import { expect, test } from './fixtures';

test('panels move between columns, persist and reset', async ({ page }) => {
  await page.goto('/');
  const main = page.getByRole('group', { name: 'main column' });
  const side = page.getByRole('group', { name: 'side column' });
  const upload = (col: typeof main) => col.getByRole('region', { name: 'Upload' });

  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(upload(side)).toBeVisible();

  await page.getByRole('button', { name: 'Upload panel actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to main column' }).click();
  await expect(upload(main)).toBeVisible();

  await page.reload();
  await expect(upload(main)).toBeVisible();

  await page.getByRole('button', { name: 'Upload panel actions' }).click();
  await page.getByRole('menuitem', { name: 'Reset layout' }).click();
  await expect(upload(side)).toBeVisible();
});
