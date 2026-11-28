const EARTH_RADIUS = 6_371_000;
const RAD = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in metres (haversine). */
export function distance(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees, 0..360 (0 = north). */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Signed smallest difference b - a in degrees, -180..180. */
export function headingDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** Point `dist` metres from `from` along an initial bearing (degrees, 0 = north). */
export function destination(from: LatLon, bearingDeg: number, dist: number): LatLon {
  const δ = dist / EARTH_RADIUS;
  const θ = bearingDeg * RAD;
  const φ1 = from.lat * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    from.lon * RAD + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / RAD, lon: ((λ2 / RAD + 540) % 360) - 180 };
}
