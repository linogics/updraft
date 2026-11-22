import type { LatLon } from '../domain/geo';

/** Closed ring of points around a centre, radius in metres. Flat-earth offsets are fine at closing-gap sizes. */
export function ring(center: LatLon, radius: number, steps = 48): LatLon[] {
  const dLat = radius / 111_320;
  const dLon = dLat / Math.cos((center.lat * Math.PI) / 180);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (2 * Math.PI * i) / steps;
    return { lat: center.lat + dLat * Math.sin(a), lon: center.lon + dLon * Math.cos(a) };
  });
}
