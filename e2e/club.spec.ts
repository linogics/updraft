import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { EMAIL, mockSyncServer, PASSWORD, SERVER } from './syncServer';

const CLUB = 'club1';

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

const FIXES = Array.from({ length: 120 }, (_, i) => ({
  t: Date.UTC(2026, 6, 15, 10) + i * 30_000,
  lat: 45.9 + i * 0.0005,
  lon: 6.2 + i * 0.0005,
  alt: 1500 + Math.sin(i / 10) * 200
}));

/** A sync server with a club and one flight another pilot shared with it. */
async function mockServer(
  page: Page,
  clubs: Record<string, { name: string; members: string[] }> = {
    [CLUB]: { name: 'Annecy club', members: ['account-a', 'account-b'] }
  }
) {
  const server = await mockSyncServer(page, { clubs });
  const put = (path: string, body: unknown) => server.asOther(path, 'PUT', body, { 'if-none-match': '*' });

  const first = Object.keys(clubs)[0];
  await put('/flights/shared-flight', {
    data: { pilot: 'Ranked Pilot', hasTrack: true, clubs: [first], club: STATS },
    times: { pilot: 1, hasTrack: 1, clubs: 1, club: 1 }
  });
  await put('/flights/shared-flight/track.json', { fixes: FIXES });
  return server;
}

async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Sync' });
  await sync.getByLabel('Server address').fill(SERVER);
  await sync.getByRole('button', { name: 'Connect' }).click();
  await sync.getByLabel('Email or username').fill(EMAIL);
  await sync.getByLabel('Password').fill(PASSWORD);
  await sync.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(sync.getByText(`Signed in as ${EMAIL}`)).toBeVisible();
}

test('shows the club rankings and opens a shared flight read-only', async ({ page }) => {
  const { writes } = await mockServer(page);
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
  await page.waitForURL(/\/studio\?.*club=club1&key=/);
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

test('sharing a flight from the logbook uploads it as shared with the club', async ({ page }) => {
  const server = await mockServer(page);
  await page.goto('/');
  await signIn(page);
  await page.getByRole('button', { name: 'load demo flights' }).click();
  await page.waitForURL(/\/studio\?/);
  await page.goto('/');

  const share = page.getByRole('button', { name: /^Share the flight of/ }).first();
  await expect(share).toHaveAttribute('aria-pressed', 'false');
  await share.click();

  await expect(share).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect
    .poll(
      async () => (await server.feed('flights')).some((i) => (i.data?.clubs as string[] | undefined)?.includes(CLUB)),
      {
        timeout: 30_000
      }
    )
    .toBe(true);
  await expect(page.getByRole('alert').filter({ hasText: 'Could not' })).toHaveCount(0);
});

test('a pilot in two clubs picks one and shares with each separately', async ({ page }) => {
  const server = await mockServer(page, {
    [CLUB]: { name: 'Annecy club', members: ['account-a', 'account-b'] },
    club2: { name: 'Second club', members: ['account-a'] }
  });
  await page.goto('/');
  await signIn(page);

  await page.getByRole('link', { name: /^Club/ }).click();
  await page.getByLabel('Club', { exact: true }).selectOption({ label: 'Second club' });
  await expect(page.getByText('No shared flights yet')).toBeVisible();
  await page.getByLabel('Club', { exact: true }).selectOption({ label: 'Annecy club' });
  await expect(page.getByRole('region', { name: 'XC points (XContest)' })).toBeVisible();

  await page.getByRole('link', { name: /^Logbook/ }).click();
  await page.getByRole('button', { name: 'load demo flights' }).click();
  await page.waitForURL(/\/studio\?/);
  await page.goto('/');
  await page.getByText('Share', { exact: true }).first().click();
  await page.getByLabel('Share with Second club').first().check();

  await expect
    .poll(
      async () =>
        (await server.feed('flights')).some((i) => (i.data?.clubs as string[] | undefined)?.join() === 'club2'),
      {
        timeout: 30_000
      }
    )
    .toBe(true);
});

test('shows the empty state for a pilot who is in no club', async ({ page }) => {
  await mockSyncServer(page, { clubs: { club1: { name: 'Other', members: ['account-b'] } } });
  await page.goto('/');
  await signIn(page);

  await page.getByRole('link', { name: /^Club/ }).click();
  await expect(page.getByText('Ask the server admin to add you to one.')).toBeVisible();
});
