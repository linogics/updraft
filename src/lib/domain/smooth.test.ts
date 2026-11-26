import { describe, expect, it } from 'vitest';

import type { Fix } from './model';
import { smoothPath } from './smooth';

const fix = (i: number, lat: number, lon: number, alt = 1000, t = i * 1000): Fix => ({ t, lat, lon, alt });
const bend = [fix(0, 47, 8), fix(1, 47.0003, 8.0003), fix(2, 47.0003, 8.0009), fix(3, 47.0009, 8.0012)];

describe('smoothPath', () => {
  it('passes through every fix and adds 3 points per segment', () => {
    const { points, index } = smoothPath(bend);

    expect(points).toHaveLength(bend.length + 3 * (bend.length - 1));
    bend.forEach((f, i) => expect(points[index[i]]).toEqual({ lat: f.lat, lon: f.lon, alt: f.alt }));
  });

  it('maps interpolated points to the start fix of their segment', () => {
    const { source, index } = smoothPath(bend);

    expect(source.slice(0, 5)).toEqual([0, 0, 0, 0, 1]);
    expect(index).toEqual([0, 4, 8, 12]);
  });

  it('interpolates altitude', () => {
    const { points } = smoothPath([fix(0, 47, 8, 1000), fix(1, 47, 8.0003, 1100), fix(2, 47, 8.0006, 1200)]);

    expect(points[2].alt).toBeCloseTo(1050, 6);
  });

  it('leaves gaps straight, by time and by distance', () => {
    const late = [
      fix(0, 47, 8),
      fix(1, 47, 8.0003),
      fix(2, 47, 8.0006, 1000, 200_000),
      fix(3, 47, 8.0009, 1000, 201_000)
    ];
    const far = [fix(0, 47, 8), fix(1, 47, 8.0003), fix(2, 47, 8.02), fix(3, 47, 8.0203)];

    for (const fixes of [late, far]) {
      const { points, index } = smoothPath(fixes);
      expect(index[2] - index[1]).toBe(1);
      expect(points).toHaveLength(4 + 6);
    }
  });

  it('stays between the fixes when the position repeats with a changing altitude', () => {
    const still = [
      fix(0, 47, 8, 1946),
      fix(1, 47, 8, 1945),
      fix(2, 47.0001, 8.0001, 1945),
      fix(3, 47.0001, 8.0002, 1945)
    ];

    const alts = smoothPath(still).points.map((p) => p.alt);
    expect(Math.min(...alts)).toBeGreaterThanOrEqual(1944);
    expect(Math.max(...alts)).toBeLessThanOrEqual(1947);
  });

  it('returns fewer than 3 fixes unchanged', () => {
    const { points, source } = smoothPath(bend.slice(0, 2));

    expect(points).toHaveLength(2);
    expect(source).toEqual([0, 1]);
  });
});
