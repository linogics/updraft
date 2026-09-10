// Synthetic demo day so the app can be tried without own IGC files.
// Two pilots launching from Brauneck (Bavarian Prealps), flying a short triangle.
import type { Fix, Flight } from '../domain/model';

const M_PER_DEG_LAT = 111_320;

type Segment =
  | { kind: 'glide'; seconds: number; heading: number; speed: number; sink: number }
  | { kind: 'thermal'; seconds: number; climb: number; radius: number; period: number; direction: 1 | -1 };

interface Cursor {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
}

function move(c: Cursor, dx: number, dy: number) {
  c.lat += dy / M_PER_DEG_LAT;
  c.lon += dx / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180));
}

function fly(start: Cursor, segments: Segment[], seed: number): Fix[] {
  const c = { ...start };
  const fixes: Fix[] = [{ t: c.t, lat: c.lat, lon: c.lon, alt: c.alt }];
  for (const s of segments) {
    for (let i = 1; i <= s.seconds; i++) {
      if (s.kind === 'glide') {
        c.heading = s.heading;
        const rad = (s.heading * Math.PI) / 180;
        move(c, Math.sin(rad) * s.speed, Math.cos(rad) * s.speed);
        c.alt -= s.sink;
      } else {
        // Turn along a circle: constant turn rate, ground speed = circumference / period.
        c.heading = (c.heading + (s.direction * 360) / s.period + 360) % 360;
        const v = (2 * Math.PI * s.radius) / s.period;
        const rad = (c.heading * Math.PI) / 180;
        move(c, Math.sin(rad) * v + 0.8, Math.cos(rad) * v); // light westerly wind drift
        // Thermal core: climb varies around the mean.
        c.alt += s.climb * (1 + 0.35 * Math.sin((i + seed) / 7));
      }
      c.t += 1000;
      // Small deterministic altitude noise like a real logger.
      fixes.push({ t: c.t, lat: c.lat, lon: c.lon, alt: Math.round(c.alt + Math.sin(c.t / 3100 + seed) * 0.8) });
    }
  }
  return fixes;
}

const START = { lat: 47.6646, lon: 11.531, alt: 1540, heading: 160 };

export function buildDemoFlights(): Flight[] {
  const day = Date.UTC(2026, 6, 18, 11, 20);
  const a = fly({ ...START, t: day }, [
    { kind: 'glide', seconds: 90, heading: 160, speed: 9, sink: 1.2 },
    { kind: 'thermal', seconds: 210, climb: 2.4, radius: 45, period: 24, direction: 1 },
    { kind: 'glide', seconds: 260, heading: 225, speed: 11, sink: 1.1 },
    { kind: 'thermal', seconds: 170, climb: 2.0, radius: 40, period: 22, direction: -1 },
    { kind: 'glide', seconds: 320, heading: 300, speed: 11, sink: 1.0 },
    { kind: 'thermal', seconds: 150, climb: 1.8, radius: 50, period: 26, direction: 1 },
    { kind: 'glide', seconds: 420, heading: 40, speed: 10, sink: 1.15 },
    { kind: 'thermal', seconds: 120, climb: 1.5, radius: 45, period: 24, direction: 1 },
    { kind: 'glide', seconds: 360, heading: 120, speed: 10, sink: 1.3 }
  ], 1);
  const b = fly({ ...START, lat: START.lat + 0.0004, t: day + 75_000 }, [
    { kind: 'glide', seconds: 110, heading: 170, speed: 9.5, sink: 1.25 },
    { kind: 'thermal', seconds: 190, climb: 2.2, radius: 42, period: 23, direction: -1 },
    { kind: 'glide', seconds: 240, heading: 230, speed: 11.5, sink: 1.2 },
    { kind: 'thermal', seconds: 200, climb: 2.3, radius: 38, period: 21, direction: -1 },
    { kind: 'glide', seconds: 300, heading: 295, speed: 11, sink: 1.05 },
    { kind: 'thermal', seconds: 130, climb: 1.6, radius: 48, period: 25, direction: 1 },
    { kind: 'glide', seconds: 450, heading: 35, speed: 10.5, sink: 1.2 },
    { kind: 'thermal', seconds: 140, climb: 1.4, radius: 44, period: 24, direction: -1 },
    { kind: 'glide', seconds: 330, heading: 125, speed: 10, sink: 1.35 }
  ], 4);

  const flight = (id: string, pilot: string, glider: string, fixes: Fix[]): Flight => ({
    id,
    sourceName: `${id}.igc`,
    pilot,
    glider,
    site: 'Brauneck',
    date: '2026-07-18',
    fixes
  });
  return [flight('demo-anna', 'Anna (demo)', 'Ozone Rush 6', a), flight('demo-ben', 'Ben (demo)', 'Advance Iota DLS', b)];
}
