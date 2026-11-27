import { expect, test } from './fixtures';
import { EMAIL, mockSyncServer, PASSWORD, SERVER, TOKEN } from './syncServer';

test('connect, sign in and sync a record to a sync server', async ({ page }) => {
  const server = await mockSyncServer(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Add flight without a track' }).click();
  await page.getByLabel('Pilot').fill('Sync Pilot');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: 'Sync Pilot', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Sync' });
  await sync.getByLabel('Server address').fill(SERVER);
  await sync.getByRole('button', { name: 'Connect' }).click();

  await sync.getByLabel('Email or username').fill(EMAIL);
  await sync.getByLabel('Password').fill(PASSWORD);
  await sync.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(sync.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
  await expect.poll(async () => (await server.feed('flights')).map((i) => i.data?.pilot)).toContain('Sync Pilot');
  const [item] = await server.feed('flights');
  expect(item.data).toMatchObject({ hasTrack: false });
  await expect(sync.getByRole('status')).toContainText('Up to date');

  await sync.getByRole('button', { name: 'Sync now' }).click();
  await expect(sync.getByRole('status')).toContainText('Up to date');
  await expect(sync.getByRole('alert')).toBeEmpty();
});

test('rejects a plain http server that is not local', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Sync' });
  await sync.getByLabel('Server address').fill('http://sync.example.com');
  await sync.getByRole('button', { name: 'Connect' }).click();

  await expect(sync.getByText('Enter an https address')).toBeVisible();
});

test('says so when the server does not speak v2', async ({ page }) => {
  await page.route(`${SERVER}/**`, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ version: 1 })
    })
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Sync' });
  await sync.getByLabel('Server address').fill(SERVER);
  await sync.getByRole('button', { name: 'Connect' }).click();

  await expect(sync.getByRole('alert')).toHaveText('This server does not speak sync v2.');
});

test('creates an account on a server that allows signup', async ({ page }) => {
  await mockSyncServer(page, { signup: { token: TOKEN } });

  await page.goto('/');
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Sync' });
  await sync.getByLabel('Server address').fill(SERVER);
  await sync.getByRole('button', { name: 'Connect' }).click();

  await sync.getByRole('button', { name: 'Create account' }).click();
  await sync.getByLabel('Email', { exact: true }).fill(EMAIL);
  await sync.getByLabel('Password').fill(PASSWORD);
  await sync.getByRole('button', { name: 'Create account' }).last().click();

  await expect(sync.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
});
