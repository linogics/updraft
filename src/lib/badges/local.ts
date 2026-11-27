import { type ClubStats, computeClubStats } from '#lib/club/stats';
import type { Flight } from '#lib/domain/model';
import type { FlightSummary } from '#lib/storage';
import type { XcScore } from '#lib/xc/types';

import { type BadgeItem, toBadgeFlight } from './progress';

/** The part of the repository the local badges read and write. */
export interface BadgeRepo {
  get(id: string): Promise<Flight | undefined>;
  getXcScore(id: string, league: string): Promise<XcScore | null | undefined>;
  getBadgeStats(id: string, league: string): Promise<ClubStats | undefined>;
  putBadgeStats(id: string, league: string, stats: ClubStats): Promise<void>;
}

/** Track flights count. Manual entries and the demo flights do not. */
export const countsForBadges = (s: FlightSummary) => !s.manual && !s.id.startsWith('demo-');

export interface LocalBadgeOptions {
  repo: BadgeRepo;
  /** Called after every flight with the number of flights done and the total. */
  onProgress?: (done: number, total: number) => void;
  /** Return false when a newer run took over, the work then stops. */
  isCurrent?: () => boolean;
}

async function statsOf(s: FlightSummary, league: string, repo: BadgeRepo): Promise<ClubStats | null> {
  // A shared flight keeps stats with ground heights. A cached record without them is re-read once it is shared.
  const cached = await repo.getBadgeStats(s.id, league);
  if (cached && (!s.shared || cached.maxAgl !== undefined)) return cached;

  const flight = await repo.get(s.id);
  if (!flight) return null;

  if (flight.club) {
    await repo.putBadgeStats(s.id, league, flight.club);
    return flight.club;
  }

  // No ground heights here, fetching terrain for a whole logbook is too much. Undefined lets the stats score the flight.
  const xc = await repo.getXcScore(s.id, league);
  const stats = await computeClubStats(flight, { league, xc });
  await repo.putBadgeStats(s.id, league, stats);
  return stats;
}

/**
 * Badge items for the track flights of the logbook, one flight at a time so the page stays responsive.
 * Returns null when a newer run took over. A flight that fails is skipped.
 */
export async function localBadgeItems(
  summaries: readonly FlightSummary[],
  league: string,
  { repo, onProgress, isCurrent = () => true }: LocalBadgeOptions
): Promise<BadgeItem<string>[] | null> {
  const list = summaries.filter(countsForBadges);
  const items: BadgeItem<string>[] = [];
  let done = 0;
  for (const s of list) {
    let stats: ClubStats | null = null;
    try {
      stats = await statsOf(s, league, repo);
    } catch (err) {
      console.error('Could not compute badge stats', err);
    }

    if (!isCurrent()) return null;

    // The summary is the truth for edited metadata, a cached record may be older.
    if (stats) {
      const flight = { ...toBadgeFlight(stats), date: s.date, site: s.site, glider: s.glider };
      items.push({ flight, date: s.date, ref: s.id });
    }

    onProgress?.(++done, list.length);
  }

  return items;
}
