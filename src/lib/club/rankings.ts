import type { ValidClubEntry } from './index';
import type { ClubStats } from './stats';

export type Medal = 'gold' | 'silver' | 'bronze';

export interface RankRow {
  owner: string;
  pilot: string;
  value: number;
  /** The flight behind the value. Missing for the per-pilot totals. */
  entryKey?: string;
  medal: Medal;
}

export const CATEGORIES = [
  'xcPoints',
  'freeDistance',
  'xcSpeed',
  'longestFlight',
  'totalAirtime',
  'mostFlights',
  'maxAltMsl',
  'maxGain',
  'maxAgl',
  'bestClimb',
  'bestThermalGain'
] as const;

export type Category = (typeof CATEGORIES)[number];

const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];

/** One value per flight. Null when the flight does not take part. */
const FLIGHT_VALUE: Partial<Record<Category, (s: ClubStats, league: string) => number | undefined>> = {
  xcPoints: (s, league) => (s.xc?.league === league ? s.xc.points : undefined),
  freeDistance: (s) => s.freeDistanceKm,
  xcSpeed: (s) => s.xc?.speedKmh,
  longestFlight: (s) => s.durationS,
  maxAltMsl: (s) => s.maxAltMsl,
  maxGain: (s) => s.maxGain,
  maxAgl: (s) => s.maxAgl,
  bestClimb: (s) => s.bestClimb,
  bestThermalGain: (s) => s.bestThermalGain
};

interface Candidate {
  owner: string;
  pilot: string;
  value: number;
  date: string;
  entryKey?: string;
}

/** Standard competition ranking: equal values share a medal, the next medal skips the tied places. */
function medals(candidates: Candidate[]): RankRow[] {
  const sorted = [...candidates].sort(
    (a, b) => b.value - a.value || a.date.localeCompare(b.date) || a.owner.localeCompare(b.owner)
  );
  const rows: RankRow[] = [];
  for (const c of sorted) {
    const place = sorted.filter((o) => o.value > c.value).length;
    if (place >= MEDALS.length) break;

    rows.push({ owner: c.owner, pilot: c.pilot, value: c.value, entryKey: c.entryKey, medal: MEDALS[place] });
  }

  return rows;
}

function perOwner(entries: ValidClubEntry[]) {
  const groups = new Map<string, ValidClubEntry[]>();
  for (const e of entries) groups.set(e.owner, [...(groups.get(e.owner) ?? []), e]);
  return [...groups].map(([owner, list]) => {
    // The latest flight names the pilot, so a renamed pilot shows the new name.
    const latest = list.reduce((a, b) => (b.stats.date >= a.stats.date ? b : a));
    return { owner, list, pilot: latest.stats.pilot, date: latest.stats.date };
  });
}

/** Top three per category over all entries. Per flight categories show each pilot once, with their best flight. */
export function rankings(entries: ValidClubEntry[], league: string): Record<Category, RankRow[]> {
  const owners = perOwner(entries);
  const result = {} as Record<Category, RankRow[]>;

  for (const cat of CATEGORIES) {
    const value = FLIGHT_VALUE[cat];
    if (value) {
      const best: Candidate[] = [];
      for (const o of owners) {
        const flights = o.list
          .map((e) => ({ e, v: value(e.stats, league) }))
          .filter((x): x is { e: ValidClubEntry; v: number } => x.v !== undefined && x.v > 0);
        if (!flights.length) continue;

        const top = flights.reduce((a, b) => (b.v > a.v || (b.v === a.v && b.e.stats.date < a.e.stats.date) ? b : a));
        best.push({
          owner: o.owner,
          pilot: top.e.stats.pilot,
          value: top.v,
          date: top.e.stats.date,
          entryKey: top.e.key
        });
      }

      result[cat] = medals(best);
    } else {
      const total = (o: (typeof owners)[number]) =>
        cat === 'totalAirtime' ? o.list.reduce((sum, e) => sum + e.stats.durationS, 0) : o.list.length;
      result[cat] = medals(owners.map((o) => ({ owner: o.owner, pilot: o.pilot, value: total(o), date: o.date })));
    }
  }

  return result;
}
