import type { CameraTracks } from '../domain/cameraPath';
import { distance } from '../domain/geo';
import type { Flight } from '../domain/model';
import type { FlightSummary, ManualEntry, MetaPatch } from '../plugins/api';

export type { FlightSummary, ManualEntry, MetaPatch };

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
