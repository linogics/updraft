import type { SyncApi } from './http';

export interface StoredSession {
  token: string;
  user: string;
}

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** The token of one server. The key has the url in it, so two servers never share a token. */
export class SessionStore {
  private readonly key: string;
  // Storage can fail, so the session also lives here for this page.
  private memory: StoredSession | null = null;

  constructor(url: string) {
    this.key = `updraft_http_auth:${url}`;
  }

  get(): StoredSession | null {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(this.key) ?? 'null');
      if (isObject(raw) && typeof raw.token === 'string' && typeof raw.user === 'string') {
        return { token: raw.token, user: raw.user };
      }
    } catch {
      // Fall back to the page copy.
    }

    return this.memory;
  }

  set(s: StoredSession | null) {
    this.memory = s;
    try {
      if (s) localStorage.setItem(this.key, JSON.stringify(s));
      else localStorage.removeItem(this.key);
    } catch {
      // Not persisted, the sign in lasts until the page closes.
    }
  }
}

/**
 * Runs in a popup. The server redirects it to /oauth-callback.html, which sends the result on a BroadcastChannel.
 * Must be called straight from the click, before any await, or the browser blocks the popup.
 */
export function signInWithPopup(api: SyncApi, provider: string): Promise<StoredSession> {
  // Only a result that carries this value is accepted, so another tab or site cannot inject one.
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  const channel = new BroadcastChannel('updraft-auth');
  const popup = window.open(api.redirectUrl(provider, state), 'updraft-auth', 'popup,width=520,height=720');
  if (!popup) {
    channel.close();
    throw new Error('The browser blocked the sign in window. Allow popups for this site.');
  }

  return new Promise((resolve, reject) => {
    // COOP can null the popup reference, so popup.closed is not used. The timeout ends a cancelled sign in.
    const timer = setTimeout(() => done(() => reject(new Error('Sign in was cancelled.'))), SIGN_IN_TIMEOUT_MS);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      channel.close();
      fn();
    };

    channel.onmessage = (e: MessageEvent<unknown>) => {
      const d = e.data;
      if (!isObject(d) || d.type !== 'updraft-auth' || d.state !== state) return;

      const name = isObject(d.user) ? d.user.name : undefined;
      if (typeof d.error === 'string') done(() => reject(new Error(d.error as string)));
      else if (typeof d.token === 'string' && d.token && typeof name === 'string' && name) {
        done(() => resolve({ token: d.token as string, user: name }));
      } else done(() => reject(new Error('The server sent an invalid sign in answer.')));
    };
  });
}
