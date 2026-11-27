import { vi } from 'vitest';

import { createMemoryServer, type MemoryServerOptions } from './v2/memory-server';

export const BASE = 'http://sync.test';

/** Routes `fetch` calls straight into the in-memory reference server. */
export const serverFetch =
  (handle: (req: Request) => Promise<Response>): typeof fetch =>
  (input, init) =>
    handle(new Request(input, init));

export const TOKEN_A = 'tok-a';
export const TOKEN_B = 'tok-b';

export const newServer = (extra: Partial<MemoryServerOptions> = {}) =>
  createMemoryServer({
    tokens: { [TOKEN_A]: 'acc-a', [TOKEN_B]: 'acc-b' },
    password: { identity: 'a@example.org', password: 'secret-pass', token: TOKEN_A },
    ...extra
  });

/** The test environment is node, so storage and window events are stubbed. */
export function stubBrowser() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
}
