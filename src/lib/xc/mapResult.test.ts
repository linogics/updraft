import { describe, expect, it } from 'vitest';

import { mapResult, type RawSolution } from './mapResult';

const p = (x: number, y: number) => ({ x, y });

describe('mapResult', () => {
  it('maps a free distance with end points', () => {
    const s: RawSolution = {
      score: 30,
      opt: { scoring: { code: 'od', multiplier: 1 } },
      scoreInfo: {
        distance: 30,
        ep: { start: p(1, 40), finish: p(1.4, 40.2) },
        tp: [p(1.1, 40.05), p(1.2, 40.1), p(1.3, 40.15)]
      }
    };
    const r = mapResult('XContest', s)!;
    expect(r.type).toBe('free');
    expect(r.distance).toBe(30_000);
    expect(r.turnpoints).toHaveLength(5);
    expect(r.turnpoints[0]).toEqual({ lat: 40, lon: 1 });
    expect(r.closing).toBeUndefined();
  });

  it('closes a triangle and sizes the closing circle', () => {
    const s: RawSolution = {
      score: 24,
      opt: { scoring: { code: 'fai', multiplier: 2 } },
      scoreInfo: {
        distance: 12,
        tp: [p(1, 40), p(1.1, 40), p(1.05, 40.1)],
        cp: { d: 0.5, in: p(1, 40), out: p(1, 40.01) }
      }
    };
    const r = mapResult('FAI', s)!;
    expect(r.type).toBe('fai');
    expect(r.turnpoints).toHaveLength(4);
    expect(r.turnpoints[3]).toEqual(r.turnpoints[0]);
    expect(r.closing?.center.lat).toBeCloseTo(40.005);
    expect(r.closing?.radius).toBe(250);
    expect(r.multiplier).toBe(2);
  });

  it('returns null when nothing scored', () => {
    expect(mapResult('FFVL', { score: 0, opt: { scoring: { code: 'od', multiplier: 1 } } })).toBeNull();
  });
});
