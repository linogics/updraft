import type { SyncChange, SyncState } from './types';

/**
 * The studio layout is per device and never syncs. The plugin list stays per device too, a plugin runs with full
 * trust, so whoever can write to the server must not be able to install code on every device.
 */
export const SYNC_PREF_KEYS = [
  'units',
  'thermalPrefs',
  'airspacePrefs',
  'thermalOverlayPrefs',
  'xcLeague',
  'xcEnabled',
  'altRef'
];
/** Raw strings, synced only when the user opted in. */
export const SYNC_SECRET_KEYS = ['cesiumIonToken', 'openaipKey'];

const OPT_IN_KEY = 'syncKeys';

type Known = SyncState['prefs'];

// Storage can throw (private mode, blocked site data) or be missing (node), so every access is guarded.
export function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not persisted.
  }
}

export const syncKeysEnabled = () => read(OPT_IN_KEY) === '1';

export function setSyncKeys(on: boolean) {
  write(OPT_IN_KEY, on ? '1' : null);
}

const allowedKeys = () => (syncKeysEnabled() ? [...SYNC_PREF_KEYS, ...SYNC_SECRET_KEYS] : SYNC_PREF_KEYS);

/** A pref counts as changed when its raw value differs from the last one pushed or applied. */
export function collectPrefChanges(known: Known): { changes: SyncChange[]; next: Known } {
  const changes: SyncChange[] = [];
  const next = { ...known };
  for (const id of allowedKeys()) {
    const raw = read(id);
    if (raw === null || known[id]?.raw === raw) continue;

    let data: unknown = raw;
    if (!SYNC_SECRET_KEYS.includes(id)) {
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
    }

    // A pref never seen on the server must not beat the server copy. It goes out at 0 and stays unknown,
    // so the pull applies whatever the server kept, the own echo included.
    if (!known[id]) {
      changes.push({ type: 'pref', id, updatedAt: 0, data });
      continue;
    }

    const updatedAt = Date.now();
    changes.push({ type: 'pref', id, updatedAt, data });
    next[id] = { raw, updatedAt };
  }

  return { changes, next };
}

/**
 * Remote prefs only reach localStorage, the live state objects pick them up on the next reload.
 * The raw value is read back so the next push does not echo it.
 */
export function applyRemotePrefs(changes: SyncChange[], known: Known): Known {
  const next = { ...known };
  const allowed = allowedKeys();
  for (const c of changes) {
    const isSecret = SYNC_SECRET_KEYS.includes(c.id);
    if (c.type !== 'pref' || c.deleted || !allowed.includes(c.id) || !Number.isFinite(c.updatedAt)) continue;
    if (isSecret ? typeof c.data !== 'string' : c.data === undefined) continue;
    // A pref unknown here takes any remote value, even one stamped 0.
    if (next[c.id] && c.updatedAt <= next[c.id].updatedAt) continue;

    write(c.id, isSecret ? (c.data as string) : JSON.stringify(c.data));
    next[c.id] = { raw: read(c.id) ?? '', updatedAt: c.updatedAt };
  }

  return next;
}
