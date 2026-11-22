import { parseIgc } from '../igc';
import type { Fix, Flight } from '../model';

export const readIgc = (text: string, sourceName: string): Flight =>
  parseIgc(text, { id: crypto.randomUUID(), sourceName });

const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, '0');

function coord(v: number, degW: number, pos: string, neg: string) {
  const a = Math.abs(v);
  let deg = Math.floor(a);
  let mm = Math.round((a - deg) * 60000);
  if (mm === 60000) {
    deg++;
    mm = 0;
  }
  return pad(deg, degW) + pad(mm, 5) + (v >= 0 ? pos : neg);
}

const alt = (a: number) => (a < 0 ? '-' + pad(-a, 4) : pad(a, 5));

function bRecord(f: Fix) {
  const d = new Date(Math.round(f.t / 1000) * 1000);
  const time = pad(d.getUTCHours(), 2) + pad(d.getUTCMinutes(), 2) + pad(d.getUTCSeconds(), 2);
  return `B${time}${coord(f.lat, 2, 'N', 'S')}${coord(f.lon, 3, 'E', 'W')}A${alt(f.alt)}${alt(f.alt)}`;
}

/** Unsigned IGC: no G record, so it is not valid for competitions. */
export function writeIgc(flight: Flight): string {
  const d = new Date(flight.fixes[0].t);
  const ddmmyy = pad(d.getUTCDate(), 2) + pad(d.getUTCMonth() + 1, 2) + pad(d.getUTCFullYear() % 100, 2);
  // A line break in a name would start a bogus record.
  const one = (s: string) => s.replace(/[\r\n]+/g, ' ');
  const lines = [
    'AXXXupdraft',
    `HFDTE${ddmmyy}`,
    `HFPLTPILOT:${one(flight.pilot)}`,
    `HFGTYGLIDERTYPE:${one(flight.glider ?? '')}`
  ];
  if (flight.site) lines.push(`HFSITSITE:${one(flight.site)}`);
  return [...lines, ...flight.fixes.map(bRecord)].join('\r\n') + '\r\n';
}
