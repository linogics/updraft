import { describe, expect, it } from 'vitest';
import type { Thermal } from '../model';
import { chain, straight } from '../testing/tracks';
import { climbKinds, extractTransitions, summarizeTransitions, transitionAlts } from './transitions';

/** Only the index range matters for transitions. */
const th = (start: number, end: number) => ({ start, end }) as Thermal;

// 300 s due east at 10 m/s, sinking 1 m/s; fix index = seconds since takeoff.
const fixes = chain((f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 300 }));

describe('extractTransitions', () => {
  it('splits the flight into launch, glides between thermals and a final glide', () => {
    const tr = extractTransitions(fixes, [th(60, 100), th(150, 200)]);

    expect(tr.map((t) => [t.kind, t.start, t.end])).toEqual([
      ['launch', 0, 60],
      ['glide', 100, 150],
      ['final', 200, 300]
    ]);
  });

  it('reports altitudes, distance, speed and glide ratio', () => {
    const [, glide] = extractTransitions(fixes, [th(60, 100), th(150, 200)]);

    expect(glide.duration).toBe(50);
    expect(glide.startAlt).toBeCloseTo(fixes[100].alt, 9);
    expect(glide.endAlt).toBeCloseTo(fixes[150].alt, 9);
    expect(glide.altLoss).toBeCloseTo(50, 6);
    expect(glide.distance).toBeCloseTo(500, -1);
    expect(glide.trackDistance).toBeCloseTo(500, -1);
    expect(glide.speed).toBeCloseTo(10, 1);
    expect(glide.glideRatio).toBeCloseTo(10, 1);
  });

  it('is one final glide when there are no thermals', () => {
    expect(extractTransitions(fixes, []).map((t) => [t.kind, t.start, t.end])).toEqual([['final', 0, 300]]);
  });

  it('skips empty segments between touching thermals and at the ends', () => {
    const tr = extractTransitions(fixes, [th(0, 100), th(100, 150), th(200, 300)]);

    expect(tr.map((t) => [t.kind, t.start, t.end])).toEqual([['glide', 150, 200]]);
  });

  it('has no glide ratio when the transition gains height', () => {
    const climbing = chain((f) => straight(f, { headingDeg: 90, speed: 10, climb: 0.5, duration: 100 }));
    const [t] = extractTransitions(climbing, []);

    expect(t.altLoss).toBeLessThan(0);
    expect(t.glideRatio).toBeNull();
  });
});

describe('summarizeTransitions', () => {
  it('averages glides between thermals only', () => {
    const tr = extractTransitions(fixes, [th(60, 100), th(150, 200), th(220, 250)]);
    const s = summarizeTransitions(tr);
    const glides = tr.filter((t) => t.kind === 'glide');

    expect(s.count).toBe(2);
    expect(s.avgStartAlt).toBeCloseTo((fixes[100].alt + fixes[200].alt) / 2, 6);
    expect(s.avgEndAlt).toBeCloseTo((fixes[150].alt + fixes[220].alt) / 2, 6);
    expect(s.lowestArrival).toBeCloseTo(fixes[220].alt, 6);
    const dist = glides[0].distance + glides[1].distance;
    expect(s.avgGlideRatio).toBeCloseTo(dist / 70, 6);
    expect(s.avgSpeed).toBeCloseTo(dist / 70, 6);
  });

  it('is empty without glides', () => {
    expect(summarizeTransitions(extractTransitions(fixes, []))).toEqual({
      count: 0,
      avgStartAlt: null,
      avgEndAlt: null,
      lowestArrival: null,
      avgGlideRatio: null,
      avgSpeed: null
    });
  });
});

describe('AGL transitions', () => {
  const tr = extractTransitions(fixes, [th(60, 100), th(150, 200), th(220, 250)]);
  const agl = (i: number) => 1000 + i;

  it('maps a transition to the looked-up altitudes', () => {
    expect(transitionAlts(tr[1], agl)).toEqual({ start: 1100, end: 1150 });
    expect(transitionAlts(tr[1])).toEqual({ start: tr[1].startAlt, end: tr[1].endAlt });
  });

  it('summarizes altitudes with the lookup and leaves the rest unchanged', () => {
    const msl = summarizeTransitions(tr);
    const s = summarizeTransitions(tr, agl);

    expect(s.avgStartAlt).toBe((1100 + 1200) / 2);
    expect(s.avgEndAlt).toBe((1150 + 1220) / 2);
    expect(s.lowestArrival).toBe(1150);
    expect(s.avgGlideRatio).toBe(msl.avgGlideRatio);
  });

  it('has no altitudes while the lookup is missing values', () => {
    const s = summarizeTransitions(tr, () => undefined);

    expect([s.avgStartAlt, s.avgEndAlt, s.lowestArrival]).toEqual([null, null, null]);
    expect(s.count).toBe(2);
  });
});

describe('climbKinds', () => {
  it('marks climbs as thermalling, glides as gliding and launch or final as searching', () => {
    const short = fixes.slice(0, 10);
    const thermals = [th(2, 4), th(6, 7)];
    const kinds = climbKinds(short.length, thermals, extractTransitions(short, thermals));

    expect(kinds).toEqual([
      'searching',
      'searching',
      'thermalling',
      'thermalling',
      'thermalling',
      'gliding',
      'thermalling',
      'thermalling',
      'searching',
      'searching'
    ]);
  });
});
