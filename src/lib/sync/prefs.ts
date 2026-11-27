import type { IndexedDbFlightRepository } from '../storage/indexeddb';
import { mergeItems } from './merge';
import type { Item } from './v2/http';

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
const isSecret = (id: string) => SYNC_SECRET_KEYS.includes(id);

/** The local value as the server stores it: parsed JSON, or the raw string for a secret. */
export function localPref(id: string): { value: unknown } | undefined {
  const raw = read(id);
  if (raw === null) return undefined;
  if (isSecret(id)) return { value: raw };

  try {
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return undefined;
  }
}

/**
 * Marks prefs whose raw value changed since the last push or pull as dirty. A pref the server never gave a copy of
 * gets time 0, so it cannot beat a server copy that turns up in a conflict.
 */
export async function detectPrefChanges(repo: IndexedDbFlightRepository): Promise<void> {
  for (const id of allowedKeys()) {
    const raw = read(id);
    const meta = await repo.getMeta('prefs', id);
    if (raw === null || meta?.raw === raw || !localPref(id)) continue;

    await repo.putMeta({
      key: `prefs:${id}`,
      collection: 'prefs',
      id,
      version: meta?.version ?? null,
      dirty: true,
      deleted: false,
      times: { value: meta ? Date.now() : 0 },
      raw,
      rev: (meta?.rev ?? 0) + 1
    });
  }
}

/**
 * Remote prefs only reach localStorage, the live state objects pick them up on the next reload.
 * The raw value is read back so the next run does not echo it. Returns true when a value was written.
 * Pulls run before local changes are detected, so a pref this device never synced takes the server copy.
 */
export async function applyRemotePref(repo: IndexedDbFlightRepository, item: Item): Promise<boolean> {
  const id = item.id;
  if (item.deleted || !allowedKeys().includes(id)) return false;

  const value = item.data?.value;
  if (isSecret(id) ? typeof value !== 'string' : value === undefined) return false;

  const meta = await repo.getMeta('prefs', id);
  if (meta?.version === item.version) return false;

  let next: unknown = value;
  let times = item.times ?? {};
  let dirty = false;
  if (meta?.dirty) {
    const merged = mergeItems({ data: { ...localPref(id) }, times: meta.times }, { data: { value }, times });
    next = merged.data.value;
    times = merged.times;
    dirty = JSON.stringify(next) !== JSON.stringify(value);
  }

  write(id, isSecret(id) ? (next as string) : JSON.stringify(next));
  await repo.putMeta({
    key: `prefs:${id}`,
    collection: 'prefs',
    id,
    version: item.version,
    dirty,
    deleted: false,
    times,
    raw: read(id) ?? '',
    rev: (meta?.rev ?? 0) + 1
  });
  return true;
}
