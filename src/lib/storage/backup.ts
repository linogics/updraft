import { flightRepository } from './index';
import type { Backup } from './repository';

const PREF_KEYS = ['units', 'thermalPrefs', 'panels'];
const TOKEN_KEY = 'cesiumIonToken';

// Storage can throw (private mode, blocked site data) or be missing (node), so every access is guarded.
function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not persisted.
  }
}

export async function buildBackup(includeToken: boolean): Promise<Backup> {
  const backup = await flightRepository.exportAll();
  for (const key of PREF_KEYS) {
    const raw = read(key);
    if (raw === null) continue;
    try {
      backup.prefs[key] = JSON.parse(raw);
    } catch {
      // Broken value, skip.
    }
  }
  const token = read(TOKEN_KEY);
  if (includeToken && token) backup.ionToken = token;
  return backup;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export async function restoreBackup(raw: unknown, mode: 'merge' | 'replace') {
  if (!isObj(raw) || raw.app !== 'updraft') throw new Error('This is not an updraft backup file.');
  if (raw.version !== 1) throw new Error(`Unsupported backup version: ${String(raw.version)}.`);
  if (!Array.isArray(raw.flights) || !Array.isArray(raw.manual) || !Array.isArray(raw.cameraPaths)) {
    throw new Error('The backup file is incomplete.');
  }
  for (const f of raw.flights) {
    if (!isObj(f) || typeof f.id !== 'string' || !Array.isArray(f.fixes) || !f.fixes.length) {
      throw new Error('The backup contains a flight without id or track.');
    }
  }
  for (const m of raw.manual) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.date !== 'string' || m.manual !== true) {
      throw new Error('The backup contains a broken manual entry.');
    }
  }
  for (const c of raw.cameraPaths) {
    if (!isObj(c) || typeof c.key !== 'string') throw new Error('The backup contains broken camera keys.');
  }
  const backup = raw as unknown as Backup;
  await flightRepository.importAll(backup, mode);

  const prefs = isObj(backup.prefs) ? backup.prefs : {};
  if (mode === 'replace') for (const key of PREF_KEYS) write(key, null);
  for (const key of PREF_KEYS) if (key in prefs) write(key, JSON.stringify(prefs[key]));
  if (typeof backup.ionToken === 'string') write(TOKEN_KEY, backup.ionToken);

  return { flights: backup.flights.length, manual: backup.manual.length, cameraPaths: backup.cameraPaths.length };
}
