import { groundSeries } from '../map/groundHeights';
import { xcPrefs } from '../state/xcPrefs.svelte';
import { flightRepository } from '../storage';
import type { IndexedDbFlightRepository } from '../storage/indexeddb';
import { scoreFlight } from '../xc/score';
import { computeClubStats } from './stats';

/** Terrain tiles must not hold the share back, the figure is skipped when they are slow. */
const GROUND_TIMEOUT_MS = 8000;

async function groundOrUndefined(fixes: Parameters<typeof groundSeries>[0]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      groundSeries(fixes),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('timeout')), GROUND_TIMEOUT_MS)))
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sets the clubs a flight is shared with. The repository marks the flight dirty, so sync pushes it.
 * The club summary is computed when the flight goes from no club to one, and dropped when it goes back to none.
 */
export async function shareFlight(
  id: string,
  clubs: string[],
  {
    repo = flightRepository,
    ground = groundOrUndefined
  }: { repo?: IndexedDbFlightRepository; ground?: typeof groundOrUndefined } = {}
): Promise<void> {
  const summary = await repo.summary(id);
  if (!summary) throw new Error(`Flight ${id} not found.`);

  if (!clubs.length) {
    await repo.updateMeta(id, { clubs: [], club: null });
    return;
  }

  if (summary.club) {
    await repo.updateMeta(id, { clubs });
    return;
  }

  const flight = await repo.get(id);
  if (!flight) throw new Error('Open the flight once to load its track, then share it.');

  const league = xcPrefs.league;
  // A solver failure only costs the XC figures, the rest of the stats still count.
  const xc = (await repo.getXcScore(id, league)) ?? (await scoreFlight(flight.fixes, league).catch(() => null));
  const club = await computeClubStats(flight, { league, ground: await ground(flight.fixes), xc });
  await repo.updateMeta(id, { clubs, club });
}
