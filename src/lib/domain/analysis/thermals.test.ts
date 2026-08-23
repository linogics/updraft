import { describe, expect, it } from 'vitest';
import { extractThermals } from './thermals';
import { chain, circle, straight } from '../testing/tracks';
import type { Phase } from '../model';

describe('extractThermals', () => {
  const fixes = chain(
    (f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 60 }),
    (f) => circle(f, { radius: 40, period: 25, climb: 2.5, duration: 100 }),
    (f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 60 })
  );
  const vario = fixes.map((_, i) => (i >= 60 && i <= 160 ? 2.5 : -1));
  vario[100] = 4.2;
  const phases: Phase[] = [
    { kind: 'gliding', start: 0, end: 59 },
    { kind: 'thermalling', start: 60, end: 160 },
    { kind: 'gliding', start: 161, end: fixes.length - 1 }
  ];

  it('creates one thermal per thermalling phase', () => {
    expect(extractThermals(fixes, vario, phases)).toHaveLength(1);
  });

  it('reports altitude gain, duration and climb rates', () => {
    const [t] = extractThermals(fixes, vario, phases);

    expect(t.start).toBe(60);
    expect(t.end).toBe(160);
    expect(t.duration).toBe(100);
    expect(t.entryAlt).toBeCloseTo(fixes[60].alt, 5);
    expect(t.exitAlt).toBeCloseTo(fixes[160].alt, 5);
    expect(t.gain).toBeCloseTo(250, 5);
    expect(t.avgClimb).toBeCloseTo(2.5, 5);
    expect(t.maxClimb).toBe(4.2);
  });

  it('places the centre inside the circle', () => {
    const [t] = extractThermals(fixes, vario, phases);
    const start = fixes[60];

    // Circle centre lies 40 m east of the circle's first fix.
    expect(t.centerLat).toBeCloseTo(start.lat, 3);
    expect(t.centerLon).toBeGreaterThan(start.lon);
  });

  it('returns nothing without thermalling phases', () => {
    expect(extractThermals(fixes, vario, [{ kind: 'gliding', start: 0, end: fixes.length - 1 }])).toEqual([]);
  });
});
