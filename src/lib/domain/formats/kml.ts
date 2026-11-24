import { m } from '../../paraglide/messages';
import type { Fix, Flight } from '../model';
import { toFlight, xmlEscape, xmlTexts } from './common';

export function readKml(text: string, sourceName: string): Flight {
  const fixes: Fix[] = [];
  for (const track of xmlTexts(text, 'gx:Track')) {
    const whens = xmlTexts(track, 'when');
    xmlTexts(track, 'gx:coord').forEach((c, i) => {
      const [lon, lat, alt = 'NaN'] = c.split(/\s+/);
      if (whens[i]) fixes.push({ t: Date.parse(whens[i]), lat: +lat, lon: +lon, alt: +alt });
    });
  }
  if (!fixes.length) {
    // Fallback: one Placemark per fix, with a Point and a TimeStamp.
    for (const pm of xmlTexts(text, 'Placemark')) {
      const when = xmlTexts(xmlTexts(pm, 'TimeStamp')[0] ?? '', 'when')[0];
      const coords = xmlTexts(xmlTexts(pm, 'Point')[0] ?? '', 'coordinates')[0];
      if (!when || !coords) continue;
      const [lon, lat, alt = 'NaN'] = coords.split(',').map((s) => s.trim());
      fixes.push({ t: Date.parse(when), lat: +lat, lon: +lon, alt: +alt });
    }
  }
  if (!fixes.length) {
    // A plain LineString carries no times, so there is nothing to play back.
    throw new Error(m.format_kml_no_time({ name: sourceName }));
  }
  return toFlight(sourceName, fixes);
}

export function writeKml(flight: Flight): string {
  const when = flight.fixes.map((f) => `<when>${new Date(f.t).toISOString()}</when>`);
  const coord = flight.fixes.map((f) => `<gx:coord>${f.lon} ${f.lat} ${f.alt}</gx:coord>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document><Placemark><name>${xmlEscape(flight.pilot)}</name>
<gx:Track><altitudeMode>absolute</altitudeMode>
${when.join('\n')}
${coord.join('\n')}
</gx:Track></Placemark></Document>
</kml>
`;
}
