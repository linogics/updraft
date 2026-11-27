import { expect, test } from './fixtures';

const SERVER = 'http://localhost:8090';
const EMAIL = 'pilot@test.local';

test('connect, sign in and sync a record to a sync server', async ({ page }) => {
  const pushed: { type: string; rid: string }[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*'
  };

  await page.route(`${SERVER}/**`, async (route) => {
    const req = route.request();
    const { pathname } = new URL(req.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });

    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    if (pathname === '/api/updraft/v1') {
      return json({
        version: 1,
        auth: { password: true, signup: false, oauth: [] },
        club: false,
        limits: { maxChanges: 200, maxPull: 1000 }
      });
    }

    if (pathname === '/api/updraft/v1/auth/password') {
      return json({ token: 'test-token', user: { id: 'u1', name: EMAIL } });
    }

    if (pathname === '/api/updraft/v1/pull') {
      return json({ changes: [], cursor: null, more: false });
    }

    if (pathname === '/api/updraft/v1/push') {
      const body = req.postDataJSON() as { changes: Array<{ type: string; id: string }> };
      for (const c of body.changes) pushed.push({ type: c.type, rid: c.id });
      return json({});
    }

    return json({ message: 'Not mocked.' }, 404);
  });

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
  await sync.getByLabel('Password').fill('secret-pass-1');
  await sync.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(sync.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
  await expect.poll(() => pushed.map((p) => p.type)).toContain('manual');
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
