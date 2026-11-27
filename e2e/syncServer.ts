import type { Page } from '@playwright/test';

import { createMemoryServer, type MemoryServerOptions } from '../src/lib/sync/v2/memory-server';

export const SERVER = 'http://localhost:8090';
export const EMAIL = 'pilot@test.local';
export const PASSWORD = 'secret-pass-1';
export const TOKEN = 'token-a';
export const OTHER_TOKEN = 'token-b';

const BASE = `${SERVER}/api/updraft/v2`;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'etag, retry-after'
};

/**
 * Serves the in-memory reference server of the sync spec on `SERVER`. It is spec exact, so the app is tested
 * against the same behavior as the contract suite. `writes` lists every write of the signed in pilot.
 */
export async function mockSyncServer(page: Page, extra: Partial<MemoryServerOptions> = {}) {
  const handle = createMemoryServer({
    tokens: { [TOKEN]: 'account-a', [OTHER_TOKEN]: 'account-b' },
    password: { identity: EMAIL, password: PASSWORD, token: TOKEN },
    ...extra
  });
  const writes: { method: string; path: string }[] = [];

  await page.route(`${SERVER}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const path = new URL(req.url()).pathname.replace('/api/updraft/v2', '');
    const authed = req.headers().authorization === `Bearer ${TOKEN}`;
    if (authed && ['PUT', 'DELETE'].includes(req.method())) writes.push({ method: req.method(), path });

    const body = req.postDataBuffer();
    const res = await handle(
      new Request(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: body && !['GET', 'HEAD'].includes(req.method()) ? new Uint8Array(body) : undefined
      })
    );
    const headers = Object.fromEntries(res.headers);
    await route.fulfill({
      status: res.status,
      headers: { ...headers, ...CORS },
      body: Buffer.from(await res.arrayBuffer())
    });
  });

  /** A request as the other pilot, for seeding the server. */
  const asOther = (path: string, method: string, body: unknown, headers: Record<string, string> = {}) =>
    handle(
      new Request(`${BASE}${path}`, {
        method,
        headers: { authorization: `Bearer ${OTHER_TOKEN}`, 'content-type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    );

  /** What the signed in pilot has stored, for checks. */
  const feed = async (collection: string) => {
    const res = await handle(new Request(`${BASE}/${collection}`, { headers: { authorization: `Bearer ${TOKEN}` } }));
    return ((await res.json()) as { items: { id: string; data?: Record<string, unknown> }[] }).items;
  };

  return { handle, writes, asOther, feed };
}
