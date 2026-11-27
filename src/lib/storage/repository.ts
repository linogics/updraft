import type { CameraTracks } from '../domain/cameraPath';
import { distance } from '../domain/geo';
import type { Flight } from '../domain/model';

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
  /** Opted in to the club list. */
  shared?: boolean;
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
