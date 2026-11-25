import { expect, test } from './fixtures';

const SERVER = 'http://localhost:8090';
const EMAIL = 'pilot@test.local';

// A JWT the SDK accepts as unexpired. The signature is never checked on the client.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, id: 'u1' })}.sig`;

test('connect, sign in and sync a record to a PocketBase server', async ({ page }) => {
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
    if (pathname === '/api/collections/users/auth-methods')
      return json({
        password: { enabled: true, identityFields: ['email'] },
        oauth2: { enabled: false, providers: [] },
        mfa: { enabled: false, duration: 0 },
        otp: { enabled: false, duration: 0 }
      });
    if (pathname === '/api/collections/users/auth-with-password')
      return json({ token, record: { id: 'u1', collectionName: 'users', email: EMAIL } });

    if (pathname === '/api/collections/records/records' && req.method() === 'POST') {
      pushed.push(req.postDataJSON());
      return json({ id: `r${pushed.length}`, ...req.postDataJSON() });
    }

    if (pathname === '/api/collections/records/records')
      return json({ page: 1, perPage: 200, totalItems: -1, totalPages: -1, items: [] });

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
