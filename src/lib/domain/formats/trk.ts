import { m } from '../../paraglide/messages';
import type { Fix, Flight } from '../model';
import { toFlight } from './common';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// T  A 47.123456ºN 11.123456ºE 27-MAR-08 10:26:00 s 1456.0 ...
// The degree sign is matched loosely because the file is often not UTF-8.
const LINE =
  /^T\s+\S?\s*(-?\d+(?:\.\d+)?)[^\dNSEW\s]*\s*([NS])\s+(-?\d+(?:\.\d+)?)[^\dNSEW\s]*\s*([EW])\s+(\d{1,2})-([A-Za-z]{3})-(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})(?:\s+[a-zA-Z])?\s+(-?\d+(?:\.\d+)?)/;

/** CompeGPS track file. Times are taken as UTC. */
export function readTrk(text: string, sourceName: string): Flight {
  const fixes: Fix[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line);
    const month = m ? MONTHS.indexOf(m[6].toUpperCase()) : -1;
    if (!m || month < 0) continue;
    const year = +m[7] < 100 ? 2000 + +m[7] : +m[7];
    fixes.push({
      t: Date.UTC(year, month, +m[5], +m[8], +m[9], +m[10]),
      lat: +m[1] * (m[2] === 'S' ? -1 : 1),
      lon: +m[3] * (m[4] === 'W' ? -1 : 1),
      alt: +m[11]
    });
  }

  if (!fixes.length) throw new Error(m.format_trk_no_points({ name: sourceName }));
  return toFlight(sourceName, fixes);
}
