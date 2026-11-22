import FitParser from 'fit-file-parser';
import type { Fix, Flight } from '../model';
import { toFlight } from './common';

export async function readFit(buf: ArrayBuffer, sourceName: string): Promise<Flight> {
  const data = await new FitParser().parseAsync(buf);
  const fixes: Fix[] = [];
  for (const r of data.records ?? []) {
    if (typeof r.position_lat !== 'number' || typeof r.position_long !== 'number' || !r.timestamp) continue;
    fixes.push({
      t: new Date(r.timestamp).getTime(),
      lat: r.position_lat,
      lon: r.position_long,
      alt: r.enhanced_altitude ?? r.altitude ?? 0
    });
  }
  if (!fixes.length) throw new Error(`${sourceName}: no GPS records found`);
  return toFlight(sourceName, fixes);
}
