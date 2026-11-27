import type { ValidClubEntry } from '#lib/club';
import type { BadgeDef } from '#lib/plugins/badgeKind';

import { type BadgeProgress, badgeProgress, type Tier, TIERS, toBadgeFlight } from './progress';

export interface ClubBadge<D> {
  def: D;
  tier: Tier;
  value: number;
}

export interface ClubBadgeRow<D> {
  owner: string;
  pilot: string;
  mine: boolean;
  score: number;
  badges: ClubBadge<D>[];
}

/** One row per pilot with the badges they reached, best score first. Only shared flights count. */
export function clubBadges<D extends BadgeDef>(
  entries: readonly ValidClubEntry[],
  defs: readonly D[]
): ClubBadgeRow<D>[] {
  const groups = new Map<string, ValidClubEntry[]>();
  for (const e of entries) groups.set(e.owner, [...(groups.get(e.owner) ?? []), e]);

  return [...groups]
    .map(([owner, list]) => {
      // The latest flight names the pilot, like in the rankings.
      const latest = list.reduce((a, b) => (b.stats.date >= a.stats.date ? b : a));
      const items = list.map((e) => ({ flight: toBadgeFlight(e.stats), date: e.stats.date, ref: e.key }));
      const badges: ClubBadge<D>[] = [];
      for (const def of defs) {
        const p: BadgeProgress<string> = badgeProgress(def, items);
        if (p.tier) badges.push({ def, tier: p.tier, value: p.value });
      }

      const score = badges.reduce((n, b) => n + TIERS.indexOf(b.tier) + 1, 0);
      return { owner, pilot: latest.stats.pilot, mine: list.some((e) => e.mine), score, badges };
    })
    .sort((a, b) => b.score - a.score || a.pilot.localeCompare(b.pilot));
}
