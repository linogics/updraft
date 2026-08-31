import { describe, expect, it } from 'vitest';
import { indexAt, positionAt } from './timeline';
import type { Fix } from './model';

const fixes: Fix[] = [
  { t: 1000, lat: 0, lon: 0, alt: 100 },
  { t: 2000, lat: 1, lon: 2, alt: 200 },
  { t: 4000, lat: 3, lon: 4, alt: 400 }
];

describe('indexAt', () => {
  it('returns the last fix at or before t', () => {
    expect(indexAt(fixes, 1000)).toBe(0);
    expect(indexAt(fixes, 1999)).toBe(0);
    expect(indexAt(fixes, 2000)).toBe(1);
    expect(indexAt(fixes, 3500)).toBe(1);
  });

  it('clamps outside the flight', () => {
    expect(indexAt(fixes, 0)).toBe(0);
    expect(indexAt(fixes, 9999)).toBe(2);
  });
});

describe('positionAt', () => {
  it('interpolates linearly between fixes', () => {
    expect(positionAt(fixes, 3000)).toEqual({ lat: 2, lon: 3, alt: 300 });
  });

  it('clamps to the first and last fix', () => {
    expect(positionAt(fixes, 0)).toEqual({ lat: 0, lon: 0, alt: 100 });
    expect(positionAt(fixes, 5000)).toEqual({ lat: 3, lon: 4, alt: 400 });
  });
});

describe('resampleAltitudes', () => {
  const a: Fix[] = [
    { t: 0, lat: 0, lon: 0, alt: 100 },
    { t: 10_000, lat: 0, lon: 0, alt: 200 }
  ];
  const b: Fix[] = [
    { t: 5_000, lat: 0, lon: 0, alt: 50 },
    { t: 15_000, lat: 0, lon: 0, alt: 150 }
  ];

  it('builds a shared time axis in seconds with nulls outside each flight', async () => {
    const { resampleAltitudes } = await import('./timeline');

    const { x, series } = resampleAltitudes([a, b], 5);

    expect(x).toEqual([0, 5, 10, 15]);
    expect(series[0]).toEqual([100, 150, 200, null]);
    expect(series[1]).toEqual([null, 50, 100, 150]);
  });

  it('caps the number of samples', async () => {
    const { resampleAltitudes } = await import('./timeline');

    const { x } = resampleAltitudes([a, b], 0.001, 100);

    expect(x.length).toBeLessThanOrEqual(101);
  });
});
