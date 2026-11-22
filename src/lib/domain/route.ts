import type { LatLon } from './geo';

export const MAX_ROUTE_POINTS = 100;
export const DEFAULT_SPEED = 20;

/** Route as `lat,lon` pairs with 5 decimals joined by `~`. */
export const encodeRoute = (pts: LatLon[]): string => pts.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('~');

/** Parses an encoded route. Invalid pairs are skipped and the result is capped at 100 points. */
export function decodeRoute(raw: string | null): LatLon[] {
  const out: LatLon[] = [];
  for (const part of (raw ?? '').split('~')) {
    const [lat, lon, ...rest] = part.split(',').map((s) => (s.trim() === '' ? NaN : Number(s)));
    if (rest.length || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) continue;
    out.push({ lat, lon });
    if (out.length === MAX_ROUTE_POINTS) break;
  }
  return out;
}

/** Splits each leg into `steps` straight parts. The scorer needs at least 5 fixes and picks turnpoints from them. */
export function densify(points: LatLon[], steps = 10): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    for (let k = 0; k < steps; k++) out.push({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lon: a.lon + ((b.lon - a.lon) * k) / steps });
  }
  if (points.length) out.push(points[points.length - 1]);
  return out;
}
