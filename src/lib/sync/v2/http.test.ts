import { describe, expect, it, vi } from 'vitest';

import { ApiError, SyncApi } from './http';

const item = { id: 'a', version: '7', deleted: false, data: { x: 1 }, times: { x: 2 } };

const api = (handler: (req: Request) => Response | Promise<Response>, token: string | null = 't') => {
  const sleeps: number[] = [];
  const requests: Request[] = [];
  const onUnauthorized = vi.fn();
  const client = new SyncApi({
    url: 'https://sync.example',
    token: () => token,
    onUnauthorized,
    sleep: async (ms) => void sleeps.push(ms),
    fetch: async (input, init) => {
      const req = new Request(input, init);
      requests.push(req);
      return handler(req);
    }
  });
  return { client, sleeps, requests, onUnauthorized };
};

describe('SyncApi', () => {
  it('sends the bearer token and the base path', async () => {
    const { client, requests } = api(() => Response.json({ items: [], cursor: null, more: false }));

    await client.listChanges('flights', 'c1', 50);

    expect(requests[0].url).toBe('https://sync.example/api/updraft/v2/flights?limit=50&since=c1');
    expect(requests[0].headers.get('authorization')).toBe('Bearer t');
  });

  it('creates with If-None-Match and updates with a quoted If-Match', async () => {
    const { client, requests } = api(() => Response.json(item));

    await client.putItem('flights', 'a', { data: {}, times: {} }, null);
    await client.putItem('flights', 'a', { data: {}, times: {} }, '7');

    expect(requests[0].headers.get('if-none-match')).toBe('*');
    expect(requests[0].headers.get('if-match')).toBeNull();
    expect(requests[1].headers.get('if-match')).toBe('"7"');
  });

  it('hands back the current item of a 412', async () => {
    const { client } = api(() => Response.json(item, { status: 412 }));

    expect(await client.putItem('flights', 'a', { data: {}, times: {} }, '1')).toEqual({ ok: false, item });
  });

  it('turns an error body into a message and falls back to the status', async () => {
    const withBody = api(() => Response.json({ message: 'Too big' }, { status: 413 }));
    await expect(withBody.client.putItem('flights', 'a', { data: {}, times: {} }, null)).rejects.toThrow('Too big');

    const plain = api(() => new Response('<html>', { status: 500 }));
    await expect(plain.client.listChanges('flights', null, 10)).rejects.toThrow('The server answered 500.');
  });

  it('waits for Retry-After on 429 and 503 and tries again', async () => {
    let n = 0;
    const { client, sleeps } = api(() =>
      ++n < 3
        ? new Response('{}', { status: n === 1 ? 429 : 503, headers: { 'retry-after': '2' } })
        : Response.json({ items: [], cursor: null, more: false })
    );

    await client.listChanges('flights', null, 10);

    expect(sleeps).toEqual([2000, 2000]);
  });

  it('caps the wait and gives up after a few tries', async () => {
    const { client, sleeps } = api(() => new Response('{}', { status: 429, headers: { 'retry-after': '9999' } }));

    await expect(client.listChanges('flights', null, 10)).rejects.toBeInstanceOf(ApiError);

    expect(sleeps).toHaveLength(3);
    expect(Math.max(...sleeps)).toBe(30_000);
  });

  it('signs out on a 401 of a signed in request', async () => {
    const { client, onUnauthorized } = api(() => new Response('{}', { status: 401 }));

    await expect(client.listChanges('flights', null, 10)).rejects.toThrow('Signed out, sign in again.');

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('shows the message of a wrong password without signing out', async () => {
    const { client, onUnauthorized } = api(() => Response.json({ message: 'Wrong' }, { status: 401 }), null);

    await expect(client.signInWithPassword('a', 'b')).rejects.toThrow('Wrong');

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('counts an existing or missing track as done and sends If-None-Match', async () => {
    const { client, requests } = api((req) => new Response(null, { status: req.url.includes('/x/') ? 412 : 404 }));

    expect(await client.putTrack('x', new Uint8Array([1]), 'application/octet-stream')).toBe('exists');
    expect(await client.putTrackJson('y', [])).toBe('gone');

    expect(requests[0].headers.get('if-none-match')).toBe('*');
  });

  it('treats a delete of an unknown item as done', async () => {
    const { client } = api(() => new Response('{}', { status: 404 }));

    expect(await client.deleteItem('flights', 'a', '1')).toBe('gone');
  });

  it('refuses a server without version 2', async () => {
    await expect(api(() => Response.json({ version: 1 })).client.capabilities()).rejects.toThrow(
      'This server does not speak sync v2.'
    );
    await expect(api(() => new Response('', { status: 404 })).client.capabilities()).rejects.toThrow(
      'This server does not speak sync v2.'
    );
  });

  it('drops feed items that are not valid items', async () => {
    const { client } = api(() =>
      Response.json({ items: [item, { id: 5 }, { id: 'b', version: '1', deleted: false }], cursor: 'k', more: false })
    );

    expect((await client.listChanges('flights', null, 10)).items.map((i) => i.id)).toEqual(['a']);
  });
});
