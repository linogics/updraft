import { describe, expect, it } from 'vitest';
import { computeSeries } from './series';
import { chain, straight } from '../testing/tracks';

describe('computeSeries', () => {
  it('reports constant vario for a constant climb', () => {
    const fixes = chain((f) => straight(f, { headingDeg: 0, speed: 0, climb: 2, duration: 60 }));

    const { vario } = computeSeries(fixes);

    for (const v of vario) expect(v).toBeCloseTo(2, 5);
  });

  it('reports ground speed and heading for straight flight east', () => {
    const fixes = chain((f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 60 }));

    const { speed, heading } = computeSeries(fixes);

    expect(speed[30]).toBeCloseTo(10, 1);
    expect(heading[30]).toBeCloseTo(90, 0);
    expect(heading[0]).toBeCloseTo(90, 0);
    expect(heading[60]).toBeCloseTo(90, 0);
  });

  it('handles irregular sampling intervals', () => {
    const fixes = chain((f) => straight(f, { headingDeg: 180, speed: 8, climb: 1.5, duration: 60, dt: 3 }));

    const { vario, speed, heading } = computeSeries(fixes);

    expect(vario[10]).toBeCloseTo(1.5, 5);
    expect(speed[10]).toBeCloseTo(8, 1);
    expect(heading[10]).toBeCloseTo(180, 0);
  });

  it('smooths single-fix altitude spikes', () => {
    const fixes = chain((f) => straight(f, { headingDeg: 0, speed: 10, climb: 0, duration: 60 }));
    fixes[30] = { ...fixes[30], alt: fixes[30].alt + 10 };

    const { vario } = computeSeries(fixes);

    expect(Math.max(...vario.map(Math.abs))).toBeLessThan(2);
  });

  it('returns aligned zero series for a single fix', () => {
    const fixes = chain((f) => straight(f, { headingDeg: 0, speed: 10, climb: 0, duration: 0 }));

    expect(computeSeries(fixes)).toEqual({ vario: [0], speed: [0], heading: [0] });
  });
});
