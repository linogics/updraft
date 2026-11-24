import type { Fix } from './model';

// Time alignment of several flights on one playback clock, e.g. flights from different days.

export const SYNC_MODES = ['real', 'timeOfDay', 'takeoff'] as const;
export type SyncMode = (typeof SYNC_MODES)[number];

const DAY = 86_400_000;

const dayStart = (t: number) => Math.floor(t / DAY) * DAY;

/**
 * Time shift per track (ms) so all tracks share one clock:
 * - real: no shift.
 * - timeOfDay: every track moves onto the first track's UTC day, keeping its time of day.
 * - takeoff: every track starts with the first track's takeoff.
 */
export function syncOffsets(tracks: Fix[][], mode: SyncMode): number[] {
  if (!tracks.length) return [];
  const ref = tracks[0][0].t;
  return tracks.map((fixes) => {
    const first = fixes[0].t;
    if (mode === 'timeOfDay') return dayStart(ref) - dayStart(first);
    if (mode === 'takeoff') return ref - first;
    return 0;
  });
}

/** Time of day when the flights start on different UTC days, else real time. */
export function defaultSyncMode(tracks: Fix[][]): SyncMode {
  const days = new Set(tracks.map((fixes) => dayStart(fixes[0].t)));
  return days.size > 1 ? 'timeOfDay' : 'real';
}

/** Copy of the fixes moved by offset ms; the input is returned unchanged for a zero offset. */
export function shiftFixes(fixes: Fix[], offset: number): Fix[] {
  if (offset === 0) return fixes;
  return fixes.map((f) => ({ ...f, t: f.t + offset }));
}

export interface Snap {
  start: number;
  /** Target the clip snapped to, or null. */
  guide: number | null;
}

/**
 * Snaps a dragged clip [start, start + duration] so that its start or end meets the closest
 * target within threshold. Returns the (possibly unchanged) start and the target used.
 */
export function snapStart(start: number, duration: number, targets: number[], threshold: number): Snap {
  let best: Snap = { start, guide: null };
  let bestDist = threshold;
  for (const target of targets) {
    for (const edge of [0, duration]) {
      const dist = Math.abs(start + edge - target);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { start: target - edge, guide: target };
      }
    }
  }
  return best;
}
