import type { ClubStats } from '#lib/club/stats';
import type { BadgeDef, BadgeFlight } from '#lib/plugins/badgeKind';

export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'cloudbase', 'stratos', 'legend'] as const;
export type Tier = (typeof TIERS)[number];

/** The shared club summary in the SI units badges use. */
export function toBadgeFlight(s: ClubStats): BadgeFlight {
  const { xc } = s;
  return {
    date: s.date,
    site: s.site,
    glider: s.glider,
    durationS: s.durationS,
    freeDistance: s.freeDistanceKm * 1000,
    maxAltMsl: s.maxAltMsl,
    maxGain: s.maxGain,
    ...(s.maxAgl !== undefined && { maxAgl: s.maxAgl }),
    bestClimb: s.bestClimb,
    bestThermalGain: s.bestThermalGain,
    ...(xc && {
      xc: {
        kind: xc.kind,
        distance: xc.distanceKm * 1000,
        ...(xc.speedKmh !== undefined && { speed: xc.speedKmh / 3.6 })
      }
    })
  };
}

export interface BadgeItem<T> {
  flight: BadgeFlight;
  /** `YYYY-MM-DD`, decides the order. */
  date: string;
  /** Whatever the caller needs to find the flight again. */
  ref: T;
}

export interface BadgeProgress<T> {
  value: number;
  tier: Tier | null;
  /** The next threshold, null at Legend. */
  next: number | null;
  /** 0 to 1, from the threshold of the current tier (or 0) to `next`. */
  ratio: number;
  /** The flight that brought the value to its current level, null when the value is 0. */
  ref: T | null;
  /** Per tier, the date it was first reached or null. */
  unlocked: (string | null)[];
}

/** Computes the progress of one badge. Items may come in any order. */
export function badgeProgress<T>(def: BadgeDef, items: readonly BadgeItem<T>[]): BadgeProgress<T> {
  // Array sort is stable, so flights of one day keep their input order.
  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const flights = sorted.map((i) => i.flight);
  // A plugin that throws or returns rubbish counts as 0.
  const valueOf = (n: number) => {
    try {
      const v = def.value(flights.slice(0, n));
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch {
      return 0;
    }
  };

  const value = valueOf(sorted.length);
  // Values never drop with more flights, so the first prefix that reaches `target` is found by bisection.
  const firstReaching = (target: number) => {
    let lo = 1;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (valueOf(mid) >= target) hi = mid;
      else lo = mid + 1;
    }

    return sorted[lo - 1];
  };

  const { thresholds } = def;
  const unlocked = thresholds.map((t) => (value >= t ? firstReaching(t).date : null));
  const reached = thresholds.filter((t) => value >= t).length;
  const next = thresholds[reached] ?? null;
  const from = reached ? thresholds[reached - 1] : 0;
  return {
    value,
    tier: reached ? TIERS[reached - 1] : null,
    next,
    ratio: next === null ? 1 : Math.min(1, Math.max(0, (value - from) / (next - from))),
    ref: value > 0 ? firstReaching(value).ref : null,
    unlocked
  };
}
