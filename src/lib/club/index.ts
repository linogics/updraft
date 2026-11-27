import type { Flight } from '../domain/model';
import { isClubStats } from '../storage/validate';
import type { ClubFlight, ClubFlightPage } from '../sync/v2/http';
import type { ClubStats } from './stats';

export interface ValidClubEntry {
  /** Pass it to the track routes. */
  key: string;
  /** Opaque account id. All flights of one pilot share it. */
  owner: string;
  mine: boolean;
  stats: ClubStats;
}

type Feed = (since: string | null) => Promise<ClubFlightPage>;

/** Reads the whole club feed from the start. Deleted rows and rows with a bad summary are dropped. */
export async function loadClubFeed(feed: Feed): Promise<ValidClubEntry[]> {
  const rows = new Map<string, ClubFlight>();
  let since: string | null = null;
  for (;;) {
    const page = await feed(since);
    // Later rows replace earlier ones, a flight that was unshared after being shared ends as deleted.
    for (const row of page.items) rows.set(row.key, row);
    since = page.cursor;
    if (!page.more) break;
  }

  return [...rows.values()].flatMap((row) =>
    !row.deleted && isClubStats(row.summary)
      ? [{ key: row.key, owner: row.owner, mine: row.mine, stats: row.summary }]
      : []
  );
}

/** A club flight as the studio shows it, built from the summary and the fixes of the track. */
export function clubFlightOf(entry: ValidClubEntry, fixes: Flight['fixes']): Flight {
  const { pilot, glider, site, date } = entry.stats;
  return { id: entry.key, sourceName: '', pilot, glider, site, date, fixes };
}

/** Studio URL that opens one club flight read-only. */
export const clubStudioHref = (clubId: string, key: string) => `/studio?${new URLSearchParams({ club: clubId, key })}`;
