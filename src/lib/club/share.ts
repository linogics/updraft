import { groundSeries } from '../map/groundHeights';
import { xcPrefs } from '../state/xcPrefs.svelte';
import { flightRepository } from '../storage';
import type { FlightRepository } from '../storage/repository';
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

/** Shares a flight with the club or takes it back. The repository marks the flight dirty, so sync pushes it. */
export async function shareFlight(
  id: string,
  on: boolean,
  {
    repo = flightRepository,
    ground = groundOrUndefined
  }: { repo?: FlightRepository; ground?: typeof groundOrUndefined } = {}
): Promise<void> {
  const flight = await repo.get(id);
  if (!flight) throw new Error(`Flight ${id} not found.`);

  if (!on) {
    const off = { ...flight, shared: false };
    delete off.club;
    await repo.save(off);
    return;
  }

  const league = xcPrefs.league;
  // A solver failure only costs the XC figures, the rest of the stats still count.
  const xc = (await repo.getXcScore(id, league)) ?? (await scoreFlight(flight.fixes, league).catch(() => null));
  await repo.save({
    ...flight,
    shared: true,
    club: await computeClubStats(flight, { league, ground: await ground(flight.fixes), xc })
  });
}
