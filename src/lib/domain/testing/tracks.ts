// Test-only synthetic track generators on a local flat-earth approximation.
import type { Fix } from '../model';

const M_PER_DEG_LAT = 111_320;

export interface Start {
  t: number;
  lat: number;
  lon: number;
  alt: number;
}

function offset(lat: number, lon: number, dx: number, dy: number): { lat: number; lon: number } {
  return {
    lat: lat + dy / M_PER_DEG_LAT,
    lon: lon + dx / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))
  };
}

/** Straight flight. headingDeg 0 = north, 90 = east. */
export function straight(
  from: Start,
  opts: { headingDeg: number; speed: number; climb: number; duration: number; dt?: number }
): Fix[] {
  const dt = opts.dt ?? 1;
  const rad = (opts.headingDeg * Math.PI) / 180;
  const fixes: Fix[] = [];
  for (let s = 0; s <= opts.duration; s += dt) {
    const p = offset(from.lat, from.lon, Math.sin(rad) * opts.speed * s, Math.cos(rad) * opts.speed * s);
    fixes.push({ t: from.t + s * 1000, ...p, alt: from.alt + opts.climb * s });
  }
  return fixes;
}

/** Circling around a centre east of the start point. direction 1 = clockwise (right turns). */
export function circle(
  from: Start,
  opts: { radius: number; period: number; climb: number; duration: number; direction?: 1 | -1; dt?: number }
): Fix[] {
  const dt = opts.dt ?? 1;
  const dir = opts.direction ?? 1;
  const fixes: Fix[] = [];
  for (let s = 0; s <= opts.duration; s += dt) {
    // Centre lies `radius` east of the start; angle π puts the first fix on the start point.
    // Clockwise seen from above (north up) means a decreasing math angle.
    const a = Math.PI - dir * ((2 * Math.PI * s) / opts.period);
    const dx = opts.radius + opts.radius * Math.cos(a);
    const dy = opts.radius * Math.sin(a);
    const p = offset(from.lat, from.lon, dx, dy);
    fixes.push({ t: from.t + s * 1000, ...p, alt: from.alt + opts.climb * s });
  }
  return fixes;
}

/** Concatenates segments, each continuing from the previous segment's last fix. */
export function chain(...segments: ((from: Start) => Fix[])[]): Fix[] {
  let from: Start = { t: Date.UTC(2026, 6, 15, 10), lat: 47.5, lon: 11.1, alt: 1500 };
  const out: Fix[] = [];
  for (const seg of segments) {
    const fixes = seg(from);
    out.push(...(out.length ? fixes.slice(1) : fixes));
    from = fixes[fixes.length - 1];
  }
  return out;
}
