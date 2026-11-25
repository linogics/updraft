import { isFlight, isClubStats } from '../storage/validate';
import type { Flight } from '../domain/model';
import type { BackendAdapter, ClubEntry } from '../sync/types';
import type { ClubStats } from './stats';

export interface ValidClubEntry extends Omit<ClubEntry, 'stats'> {
  stats: ClubStats;
}

/** The shared flights of every pilot on the server. Rows with a bad summary are dropped. Empty without club support. */
export async function loadClub(adapter: BackendAdapter): Promise<ValidClubEntry[]> {
  const entries = (await adapter.club?.list()) ?? [];
  return entries.filter((e): e is ValidClubEntry => isClubStats(e.stats));
}

/** One shared flight with its track. Throws when the server sent something that is not a flight. */
export async function loadClubFlight(adapter: BackendAdapter, key: string): Promise<Flight> {
  const data = await adapter.club?.flight(key);
  if (!isFlight(data)) throw new Error('The shared flight is not valid.');
  return data as Flight;
}
