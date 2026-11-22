import { m } from '../../paraglide/messages';
import type { Fix, Flight } from '../model';
import { toFlight, xmlEscape, xmlTexts } from './common';

export function readGpx(text: string, sourceName: string): Flight {
  const fixes: Fix[] = [];
  for (const m of text.matchAll(/<(?:[\w.-]+:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?trkpt>)/g)) {
    const lat = /\blat\s*=\s*["']([^"']+)["']/.exec(m[1]);
    const lon = /\blon\s*=\s*["']([^"']+)["']/.exec(m[1]);
    const time = xmlTexts(m[2] ?? '', 'time')[0];
    if (!lat || !lon || !time) continue;
    fixes.push({ t: Date.parse(time), lat: +lat[1], lon: +lon[1], alt: +(xmlTexts(m[2], 'ele')[0] ?? NaN) });
  }
  if (!fixes.length) throw new Error(m.format_gpx_no_points({ name: sourceName }));
  return toFlight(sourceName, fixes);
}

export function writeGpx(flight: Flight): string {
  const pts = flight.fixes.map(
    (f) => `<trkpt lat="${f.lat}" lon="${f.lon}"><ele>${f.alt}</ele><time>${new Date(f.t).toISOString()}</time></trkpt>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="updraft" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${xmlEscape(flight.pilot)}</name><trkseg>
${pts.join('\n')}
</trkseg></trk>
</gpx>
`;
}
