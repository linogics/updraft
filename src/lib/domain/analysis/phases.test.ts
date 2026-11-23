import { describe, expect, it } from 'vitest';
import { detectPhases } from './phases';
import { computeSeries } from './series';
import { chain, circle, straight } from '../testing/tracks';
import type { Fix, Phase } from '../model';

function phasesOf(fixes: Fix[]): Phase[] {
  return detectPhases(fixes, computeSeries(fixes).heading);
}

const glide =
  (duration: number, headingDeg = 90) =>
  (f: Parameters<typeof straight>[0]) =>
    straight(f, { headingDeg, speed: 10, climb: -1, duration });
const thermal =
  (duration: number, direction: 1 | -1 = 1) =>
  (f: Parameters<typeof circle>[0]) =>
    circle(f, { radius: 40, period: 25, climb: 2, duration, direction });

describe('detectPhases', () => {
  it('returns no phases for an empty track', () => {
    expect(detectPhases([], [])).toEqual([]);
  });

  it('classifies continuous circling as one thermalling phase', () => {
    const fixes = chain(thermal(120));

    expect(phasesOf(fixes)).toEqual([{ kind: 'thermalling', start: 0, end: fixes.length - 1 }]);
  });

  it('detects left-hand circling too', () => {
    expect(phasesOf(chain(thermal(120, -1))).map((p) => p.kind)).toEqual(['thermalling']);
  });

  it('classifies straight flight as one gliding phase', () => {
    const fixes = chain(glide(120));

    expect(phasesOf(fixes)).toEqual([{ kind: 'gliding', start: 0, end: fixes.length - 1 }]);
  });

  it('splits glide, thermal, glide at the transitions', () => {
    const phases = phasesOf(chain(glide(120), thermal(120), glide(120)));

    expect(phases.map((p) => p.kind)).toEqual(['gliding', 'thermalling', 'gliding']);
    expect(Math.abs(phases[1].start - 120)).toBeLessThanOrEqual(10);
    expect(Math.abs(phases[1].end - 240)).toBeLessThanOrEqual(10);
  });

  it('does not treat S-turns as thermalling', () => {
    const zigzag = Array.from({ length: 12 }, (_, i) => glide(10, i % 2 ? 150 : 30));

    const kinds = phasesOf(chain(...zigzag)).map((p) => p.kind);

    expect(kinds).not.toContain('thermalling');
    expect(kinds).toContain('searching');
  });

  it('covers every fix with contiguous phases', () => {
    const fixes = chain(glide(90), thermal(60), glide(30), thermal(90), glide(60));

    const phases = phasesOf(fixes);

    expect(phases[0].start).toBe(0);
    expect(phases[phases.length - 1].end).toBe(fixes.length - 1);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i].start).toBe(phases[i - 1].end + 1);
      expect(phases[i].kind).not.toBe(phases[i - 1].kind);
    }
  });
});
