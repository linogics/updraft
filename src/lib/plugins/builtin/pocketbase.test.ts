import PocketBase, { ClientResponseError } from 'pocketbase';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { SyncChange } from '#lib/sync/types';

import { createPocketBase } from './pocketbase';

const URL = 'http://localhost:8090';
const KEY = `updraft_pb_auth:${URL}`;

const change = (id: string, data: unknown = null): SyncChange => ({ type: 'pref', id, updatedAt: 1, data });
const many = (n: number) => Array.from({ length: n }, (_, i) => change(`c${i}`));
const big = (id: string) => change(id, 'x'.repeat(6 * 1024 * 1024));

/** Sent chunks of all send calls, in order. */
const chunks = (send: MockInstance<PocketBase['send']>) =>
  send.mock.calls.map((c) => (c[1] as { body: { changes: SyncChange[] } }).body.changes);

// A JWT-shaped token that expires far in the future, so the auth store sees it as valid.
const token = () => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp: 4102444800 })}.sig`;
};

describe('pocketbase push', () => {
  let send: MockInstance<PocketBase['send']>;

  beforeEach(() => {
    const store = new Map<string, string>();
    // The PocketBase auth store reads window.localStorage, which node does not have.
    vi.stubGlobal('window', {
      addEventListener: () => {},
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k)
      }
    });
    window.localStorage.setItem(KEY, JSON.stringify({ token: token(), record: { id: 'u1' } }));
    send = vi.spyOn(PocketBase.prototype, 'send').mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('splits 450 small changes into 200, 200 and 50', async () => {
    const all = many(450);
    await createPocketBase({ url: URL }).push(all);

    expect(send).toHaveBeenCalledWith('/api/updraft/push', { method: 'POST', body: { changes: all.slice(0, 200) } });
    expect(chunks(send).map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunks(send).flat()).toEqual(all);
  });

  it('starts a new chunk before a chunk would pass 16 MiB', async () => {
    const all = [big('a'), big('b'), big('c')];
    await createPocketBase({ url: URL }).push(all);

    expect(chunks(send).map((c) => c.map((x) => x.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('sends a change over 16 MiB alone', async () => {
    const huge = change('huge', 'x'.repeat(17 * 1024 * 1024));
    await createPocketBase({ url: URL }).push([change('a'), huge, change('b')]);

    expect(chunks(send).map((c) => c.map((x) => x.id))).toEqual([['a'], ['huge'], ['b']]);
  });

  it('does not call the server for an empty list', async () => {
    await createPocketBase({ url: URL }).push([]);

    expect(send).not.toHaveBeenCalled();
  });

  it('maps a 404 to the outdated kit message', async () => {
    send.mockRejectedValue(new ClientResponseError({ status: 404 }));

    await expect(createPocketBase({ url: URL }).push(many(1))).rejects.toThrow('The sync server kit is outdated.');
  });

  it('rethrows other errors and stops after the failing chunk', async () => {
    const err = new ClientResponseError({ status: 500 });
    send.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(err);

    await expect(createPocketBase({ url: URL }).push(many(450))).rejects.toBe(err);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('requires a signed in user', async () => {
    window.localStorage.removeItem(KEY);

    await expect(createPocketBase({ url: URL }).push(many(1))).rejects.toThrow('Not signed in.');
    expect(send).not.toHaveBeenCalled();
  });
});
