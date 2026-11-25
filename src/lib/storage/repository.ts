import type { CameraTracks } from '../domain/cameraPath';
import { distance } from '../domain/geo';
import type { Flight } from '../domain/model';
import type { SyncChange, SyncState } from '../sync/types';
import type { XcLeague } from '../state/xcPrefs';
import type { XcScore } from '../xc/types';

/** Flight metadata without fixes, for listings. */
export interface FlightSummary {
  id: string;
  sourceName: string;
  pilot: string;
  glider: string | null;
  site: string | null;
  date: string;
  fixCount: number;
  startTime: number;
  endTime: number;
  notes?: string;
  /** Highest fix altitude in metres. */
  maxAlt?: number;
  trackKm?: number;
  /** Logged by hand, no track stored. */
  manual?: true;
}

export interface ManualEntry {
  id?: string;
  date: string;
  pilot: string;
  glider: string | null;
  site: string | null;
  durationMin: number;
  notes: string;
}

export type MetaPatch = Partial<Pick<FlightSummary, 'pilot' | 'glider' | 'site' | 'notes'>>;

export interface Backup {
  app: 'updraft';
  version: 1;
  exportedAt: string;
  flights: Flight[];
  manual: FlightSummary[];
  cameraPaths: { key: string; tracks: CameraTracks }[];
  prefs: Record<string, unknown>;
  ionToken?: string;
  openaipKey?: string;
}

/**
 * Persistence boundary. V1 stores flights in the browser (IndexedDB);
 * a later HTTP implementation talks to the backend with the same contract.
 */
export interface FlightRepository {
  list(): Promise<FlightSummary[]>;
  get(id: string): Promise<Flight | undefined>;
  save(flight: Flight): Promise<void>;
  delete(id: string): Promise<void>;
  /** Camera tracks for a set of flights. The order of ids does not matter. Defaults when none saved. */
  getCameraTracks(flightIds: string[]): Promise<CameraTracks>;
  saveCameraTracks(flightIds: string[], tracks: CameraTracks): Promise<void>;
  /** Cached XC score. Undefined when never computed, null when computed but nothing scored. Dropped with the flight. */
  getXcScore(flightId: string, league: XcLeague): Promise<XcScore | null | undefined>;
  putXcScore(flightId: string, league: XcLeague, score: XcScore | null): Promise<void>;
  saveManual(entry: ManualEntry): Promise<void>;
  updateMeta(id: string, patch: MetaPatch): Promise<void>;
  /** Flights, manual entries and camera paths. Prefs and token are added by the backup layer. */
  exportAll(): Promise<Backup>;
  importAll(backup: Backup, mode: 'merge' | 'replace'): Promise<void>;
  /** Local changes not yet pushed. Prefs are not included, the sync engine detects them itself. */
  pendingChanges(): Promise<SyncChange[]>;
  /** Clears the dirty flag, but not for records that were written again since. */
  markPushed(changes: SyncChange[]): Promise<void>;
  /** Writes pulled changes without marking them dirty. Newer wins, invalid ones are counted and skipped. */
  applyRemote(changes: SyncChange[]): Promise<{ applied: number; invalid: number }>;
  getSyncState(): Promise<SyncState>;
  setSyncState(state: SyncState): Promise<void>;
}

export function summarize(flight: Flight): FlightSummary {
  const { fixes, ...meta } = flight;
  let maxAlt = -Infinity;
  let m = 0;
  fixes.forEach((f, i) => {
    maxAlt = Math.max(maxAlt, f.alt);
    if (i) m += distance(fixes[i - 1], f);
  });
  return {
    ...meta,
    fixCount: fixes.length,
    startTime: fixes[0].t,
    endTime: fixes[fixes.length - 1].t,
    maxAlt,
    trackKm: m / 1000
  };
}
