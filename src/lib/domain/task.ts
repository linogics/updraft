import { xmlEscape } from './formats/common';
import type { LatLon } from './geo';

/** Cylinder radius around each turnpoint, metres. XCTrack's default. */
const RADIUS = 400;

const name = (i: number) => `TP${String(i + 1).padStart(2, '0')}`;

/** Route as an XCTrack task file (.xctsk, version 1). Turnpoints only, no start or goal gates. */
export function writeXctsk(points: LatLon[]): string {
  const turnpoints = points.map((p, i) => ({
    radius: RADIUS,
    waypoint: { name: name(i), description: '', lat: p.lat, lon: p.lon, altSmoothed: 0 }
  }));
  return JSON.stringify({ taskType: 'CLASSIC', version: 1, earthModel: 'WGS84', turnpoints }, null, 2);
}

/** Route as a GPX route, which most flight instruments and map apps import. */
export function writeRouteGpx(points: LatLon[], title: string): string {
  const pts = points.map((p, i) => `<rtept lat="${p.lat}" lon="${p.lon}"><name>${name(i)}</name></rtept>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="updraft" xmlns="http://www.topografix.com/GPX/1/1">
<rte><name>${xmlEscape(title)}</name>
${pts.join('\n')}
</rte>
</gpx>
`;
}
