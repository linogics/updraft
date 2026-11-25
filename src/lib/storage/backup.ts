import { flightRepository } from './index';
import type { Backup } from './repository';
import { isCameraPath, isFlight, isManual, isObj } from './validate';

const PREF_KEYS = ['units', 'thermalPrefs', 'panels', 'airspacePrefs', 'thermalOverlayPrefs', 'xcEnabled'];
const TOKEN_KEY = 'cesiumIonToken';
const OPENAIP_KEY = 'openaipKey';

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
  const openaip = read(OPENAIP_KEY);
  if (includeToken && openaip) backup.openaipKey = openaip;
  return backup;
}

import { m } from '../paraglide/messages';

export async function restoreBackup(raw: unknown, mode: 'merge' | 'replace') {
  if (!isObj(raw) || raw.app !== 'updraft') throw new Error(m.backup_not_backup());
  if (raw.version !== 1) throw new Error(m.backup_version({ version: String(raw.version) }));

  if (!Array.isArray(raw.flights) || !Array.isArray(raw.manual) || !Array.isArray(raw.cameraPaths)) {
    throw new Error(m.backup_incomplete());
  }

  for (const f of raw.flights) {
    if (!isFlight(f)) throw new Error(m.backup_bad_flight());
  }

  for (const entry of raw.manual) {
    if (!isManual(entry)) throw new Error(m.backup_bad_manual());
  }

  for (const c of raw.cameraPaths) {
    if (!isCameraPath(c)) throw new Error(m.backup_bad_camera());
  }

  const backup = raw as unknown as Backup;
  await flightRepository.importAll(backup, mode);

  const prefs = isObj(backup.prefs) ? backup.prefs : {};
  if (mode === 'replace') for (const key of PREF_KEYS) write(key, null);
  for (const key of PREF_KEYS) if (key in prefs) write(key, JSON.stringify(prefs[key]));
  if (typeof backup.ionToken === 'string') write(TOKEN_KEY, backup.ionToken);
  if (typeof backup.openaipKey === 'string') write(OPENAIP_KEY, backup.openaipKey);

  return { flights: backup.flights.length, manual: backup.manual.length, cameraPaths: backup.cameraPaths.length };
}
