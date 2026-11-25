import { analyzeFlight } from '../domain/analysis/analyze';
import type { Flight } from '../domain/model';
import { scoreFlight } from '../xc/score';
import type { XcScore } from '../xc/types';
import type { XcLeague } from '../state/xcPrefs';

/** What a shared flight tells the club without its track. Every ranking reads from here. */
export interface ClubStats {
  v: 1;
  pilot: string;
  date: string;
  site: string | null;
  glider: string | null;
  durationS: number;
  freeDistanceKm: number;
  maxAltMsl: number;
  /** Highest altitude minus takeoff altitude, metres. */
  maxGain: number;
  /** Only when ground heights were available. */
  maxAgl?: number;
  /** Best average climb of one thermal, m/s. */
  bestClimb: number;
  /** Biggest altitude gain of one thermal, metres. */
  bestThermalGain: number;
  xc?: { league: string; points: number; distanceKm: number; kind: string; speedKmh?: number };
}

export interface ClubStatsOptions {
  league: XcLeague;
  /** Ground height in metres MSL per fix. */
  ground?: ArrayLike<number>;
  /** A known score for `league`. Null means nothing scored. Scored here when left out. */
  xc?: XcScore | null;
}

/** Average speed from the first to the last scored route point, when both sit on distinct fixes. */
function xcSpeedKmh(flight: Flight, xc: XcScore): number | undefined {
  const { fixes } = flight;
  const first = xc.turnpoints[0];
  const last = xc.turnpoints.at(-1);
  if (!first || !last) return undefined;

  // The solver returns coordinates of real fixes unchanged, so an exact match finds the fix and its time.
  const a = fixes.findIndex((f) => f.lat === first.lat && f.lon === first.lon);
  const b = fixes.findLastIndex((f) => f.lat === last.lat && f.lon === last.lon);
  // Closed routes start and end on the same point, so they have no usable time and get no speed.
  if (a < 0 || b <= a) return undefined;

  const hours = (fixes[b].t - fixes[a].t) / 3_600_000;
  return hours > 0 ? xc.distance / 1000 / hours : undefined;
}

export async function computeClubStats(flight: Flight, opts: ClubStatsOptions): Promise<ClubStats> {
  const { stats, thermals } = analyzeFlight(flight);
  const xc = opts.xc === undefined ? await scoreFlight(flight.fixes, opts.league) : opts.xc;

  const out: ClubStats = {
    v: 1,
    pilot: flight.pilot,
    date: flight.date,
    site: flight.site,
    glider: flight.glider,
    durationS: stats.duration,
    // A triangle perimeter is not a free distance, so only a free route counts besides the furthest point.
    // shortcut: when a triangle scores best the free route is unknown, score free distance separately if pilots notice.
    freeDistanceKm: Math.max(xc?.type === 'free' ? xc.distance : 0, stats.maxDistanceFromTakeoff) / 1000,
    maxAltMsl: stats.maxAlt,
    maxGain: stats.maxAlt - stats.takeoffAlt,
    bestClimb: thermals.reduce((m, t) => Math.max(m, t.avgClimb), 0),
    bestThermalGain: thermals.reduce((m, t) => Math.max(m, t.gain), 0)
  };

  const { ground } = opts;
  if (ground && ground.length === flight.fixes.length) {
    out.maxAgl = flight.fixes.reduce((m, f, i) => Math.max(m, f.alt - ground[i]), 0);
  }

  if (xc) {
    out.xc = { league: xc.league, points: xc.points, distanceKm: xc.distance / 1000, kind: xc.type };
    const speed = xcSpeedKmh(flight, xc);
    if (speed !== undefined) out.xc.speedKmh = speed;
  }

  return out;
}
