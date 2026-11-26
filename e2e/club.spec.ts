import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const SERVER = 'http://localhost:8090';
const EMAIL = 'pilot@test.local';
const KEY = 'club1';

// A JWT the SDK accepts as unexpired. The signature is never checked on the client.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600, id: 'u1' })}.sig`;

const STATS = {
  v: 1,
  pilot: 'Ranked Pilot',
  date: '2026-07-15',
  site: 'Annecy',
  glider: null,
  durationS: 3600,
  freeDistanceKm: 42,
  maxAltMsl: 2100,
  maxGain: 900,
  bestClimb: 3.1,
  bestThermalGain: 400,
  xc: { league: 'XContest', points: 55.5, distanceKm: 42, kind: 'free' }
};

const FLIGHT = {
  id: 'shared-flight',
  sourceName: 'shared.igc',
  pilot: 'Ranked Pilot',
  glider: null,
  site: 'Annecy',
  date: '2026-07-15',
  fixes: Array.from({ length: 120 }, (_, i) => ({
    t: Date.UTC(2026, 6, 15, 10) + i * 30_000,
    lat: 45.9 + i * 0.0005,
    lon: 6.2 + i * 0.0005,
    alt: 1500 + Math.sin(i / 10) * 200
  })),
  shared: true,
  club: STATS
};

/** A PocketBase server with one shared flight of another pilot. Collects what the app writes. */
async function mockServer(page: Page) {
  const writes: Record<string, unknown>[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*'
  };

  await page.route(`${SERVER}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    const list = (items: unknown[]) => json({ page: 1, perPage: 200, totalItems: -1, totalPages: -1, items });

    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    if (url.pathname === '/api/collections/users/auth-methods') {
      return json({
        password: { enabled: true, identityFields: ['email'] },
        oauth2: { enabled: false, providers: [] },
        mfa: { enabled: false, duration: 0 },
        otp: { enabled: false, duration: 0 }
      });
    }

    if (url.pathname === '/api/collections/users/auth-with-password') {
      return json({ token, record: { id: 'u1', collectionName: 'users', email: EMAIL } });
    }

    if (url.pathname === `/api/collections/records/records/${KEY}`) {
      return json({ id: KEY, shared: true, data: FLIGHT });
    }

    if (url.pathname === '/api/collections/records/records') {
      if (req.method() !== 'GET') {
        const body = req.postDataJSON() as Record<string, unknown>;
        writes.push(body);
        return json({ id: `r${writes.length}`, ...body });
      }

      return list(
        url.searchParams.get('filter')?.includes('shared = true') ? [{ id: KEY, owner: 'u2', summary: STATS }] : []
      );
    }

    return json({ message: 'Not mocked.' }, 404);
  });

  return writes;
}

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Sync' });
  await sync.getByLabel('Server address').fill(SERVER);
  await sync.getByRole('button', { name: 'Connect' }).click();
  await sync.getByLabel('Email or username').fill(EMAIL);
  await sync.getByLabel('Password').fill('secret-pass-1');
  await sync.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(sync.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
}

test('shows the club rankings and opens a shared flight read-only', async ({ page }) => {
  const writes = await mockServer(page);
  await page.goto('/');
  await expect(page.getByText('Sign in to a sync server in the logbook to see your club.')).toBeVisible();
  await signIn(page);

  await page.getByRole('link', { name: /^Club/ }).click();
  await expect(page.getByRole('heading', { name: 'Club', level: 1 })).toBeVisible();

  const points = page.getByRole('region', { name: 'XC points (XContest)' });
  const row = points.getByRole('listitem').filter({ hasText: 'Ranked Pilot' });
  await expect(row.getByRole('img', { name: 'Gold' })).toBeVisible();
  await expect(row).toContainText('55.50');

  await page.getByRole('button', { name: 'Flights' }).click();
  await expect(page.getByRole('cell', { name: /^Ranked Pilot/ })).toBeVisible();

  await page
    .getByRole('cell', { name: /^Ranked Pilot/ })
    .getByRole('link')
    .click();
  await page.waitForURL(/\/studio\?.*club=club1/);
  await expect(page.getByRole('navigation', { name: 'Outliner' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('not available')).toHaveCount(0);

  // Opening a club flight must not write anything to the server or save the flight locally.
  expect(writes).toEqual([]);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'load demo flights' })).toBeVisible();
});

test('a totals pilot filters the flights and the menu marks the current page', async ({ page }) => {
  await mockServer(page);
  await page.goto('/');
  await signIn(page);

  const menu = page.getByRole('navigation', { name: 'Tools' });
  await expect(menu.getByRole('link', { name: /^Logbook/ })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('link', { name: /^Club/ }).click();
  await expect(menu.getByRole('link', { name: /^Club/ })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: /^Logbook/ })).not.toHaveAttribute('aria-current', 'page');

  await page.getByRole('region', { name: 'Total airtime' }).getByRole('button', { name: 'Ranked Pilot' }).click();
  await expect(page.getByText('Flights of Ranked Pilot')).toBeVisible();
  await expect(page.getByRole('cell', { name: /^Ranked Pilot/ })).toBeVisible();

  await page.getByRole('button', { name: 'Show all' }).click();
  await expect(page.getByText('Flights of Ranked Pilot')).toHaveCount(0);

  await menu.getByRole('link', { name: /^Logbook/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(menu.getByRole('link', { name: /^Logbook/ })).toHaveAttribute('aria-current', 'page');
});

test('the menu is shown on the converter', async ({ page }) => {
  await page.goto('/convert');
  const menu = page.getByRole('navigation', { name: 'Tools' });
  await expect(menu.getByRole('link', { name: /^Convert/ })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: /^Logbook/ })).toBeVisible();
});

test('sharing a flight from the logbook uploads it as shared', async ({ page }) => {
  const writes = await mockServer(page);
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'load demo flights' }).click();
  await page.waitForURL(/\/studio\?/);
  await page.goto('/');

  const share = page.getByRole('button', { name: /^Share the flight of/ }).first();
  await expect(share).toHaveAttribute('aria-pressed', 'false');
  await share.click();

  await expect(share).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect.poll(() => writes.some((w) => w.type === 'flight' && w.shared === true), { timeout: 30_000 }).toBe(true);
  await expect(page.getByRole('alert').filter({ hasText: 'Could not' })).toHaveCount(0);
});
