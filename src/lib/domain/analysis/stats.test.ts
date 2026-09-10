import { describe, expect, it } from 'vitest';
import { computeStats } from './stats';
import { chain, straight } from '../testing/tracks';
import type { Phase } from '../model';

describe('computeStats', () => {
  // 100 s climb north, then 100 s glide south back past the start.
  const fixes = chain(
    (f) => straight(f, { headingDeg: 0, speed: 0, climb: 3, duration: 100 }),
    (f) => straight(f, { headingDeg: 0, speed: 10, climb: -1, duration: 100 }),
    (f) => straight(f, { headingDeg: 180, speed: 10, climb: -1, duration: 50 })
  );
  const vario = fixes.map((_, i): number => (i <= 100 ? 3 : -1));
  vario[120] = -2.5;
  const phases: Phase[] = [
    { kind: 'thermalling', start: 0, end: 100 },
    { kind: 'gliding', start: 101, end: fixes.length - 1 }
  ];

  const stats = computeStats(fixes, vario, phases);

  it('reports duration and altitudes', () => {
    expect(stats.duration).toBe(250);
    expect(stats.takeoffAlt).toBe(1500);
    expect(stats.maxAlt).toBeCloseTo(1800, 5);
    expect(stats.minAlt).toBe(1500);
    expect(stats.landingAlt).toBeCloseTo(1650, 5);
  });

  it('reports track length, straight and max distance', () => {
    expect(stats.trackLength).toBeCloseTo(1500, -1);
    expect(stats.maxDistanceFromTakeoff).toBeCloseTo(1000, -1);
    expect(stats.straightDistance).toBeCloseTo(500, -1);
  });

  it('reports extreme climb and sink', () => {
    expect(stats.maxClimb).toBe(3);
    expect(stats.maxSink).toBe(-2.5);
  });

  it('reports time share per phase', () => {
    expect(stats.phaseShare.thermalling).toBeCloseTo(100 / 250, 2);
    expect(stats.phaseShare.gliding).toBeCloseTo(150 / 250, 2);
    expect(stats.phaseShare.searching).toBe(0);
  });

  it('reports glide ratio over gliding phases', () => {
    // 10 m/s forward, 1 m/s sink.
    expect(stats.glideRatio).toBeCloseTo(10, 0);
  });

  it('has no glide ratio without gliding phases', () => {
    expect(computeStats(fixes, vario, [{ kind: 'thermalling', start: 0, end: fixes.length - 1 }]).glideRatio).toBeNull();
  });
});
