import { describe, expect, it } from 'vitest';

import type { Flight } from '../model';
import { chain, circle, straight } from '../testing/tracks';
import { analyzeFlight } from './analyze';

describe('analyzeFlight', () => {
  const fixes = chain(
    (f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 120 }),
    (f) => circle(f, { radius: 40, period: 25, climb: 2, duration: 150 }),
    (f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 120 })
  );
  const flight: Flight = {
    id: 'f',
    sourceName: 'x.igc',
    pilot: 'P',
    glider: null,
    site: null,
    date: '2026-07-15',
    fixes
  };

  const analysis = analyzeFlight(flight);

  it('aligns per-fix series with the fixes', () => {
    expect(analysis.vario).toHaveLength(fixes.length);
    expect(analysis.speed).toHaveLength(fixes.length);
    expect(analysis.heading).toHaveLength(fixes.length);
  });

  it('finds the thermal with roughly the expected gain', () => {
    expect(analysis.thermals).toHaveLength(1);
    expect(analysis.thermals[0].avgClimb).toBeGreaterThan(1.5);
    expect(analysis.thermals[0].gain).toBeGreaterThan(250);
  });

  it('includes whole-flight stats', () => {
    expect(analysis.stats.duration).toBe(390);
    expect(analysis.stats.phaseShare.thermalling).toBeGreaterThan(0.3);
  });
});
