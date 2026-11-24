import { m } from '../../paraglide/messages';
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
      alt: r.enhanced_altitude ?? r.altitude ?? NaN
    });
  }

  if (!fixes.length) throw new Error(m.format_fit_no_gps({ name: sourceName }));
  return toFlight(sourceName, fixes);
}
