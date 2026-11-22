import { describe, expect, it } from 'vitest';
import { MAX_KEYS, type CameraTracks } from './cameraPath';
import { directCamera as directTracks } from './director';
import { headingDelta } from './geo';
import type { Fix, Phase } from './model';

/** Shots as {t, heading, pitch, range} rows, read back from the tracks. */
const shotsOf = (tr: CameraTracks) =>
  tr.heading.keys.map((k, i) => ({ t: k.t, heading: k.v, pitch: tr.pitch.keys[i].v, range: tr.range.keys[i].v }));
const directCamera = (...args: Parameters<typeof directTracks>) => shotsOf(directTracks(...args));

/** One fix per second, flying north at about 11 m/s. */
const northbound = (count: number): Fix[] =>
  Array.from({ length: count }, (_, i) => ({ t: i * 1000, lat: 47 + i * 0.0001, lon: 11, alt: 1000 }));

const phases: Phase[] = [
  { kind: 'gliding', start: 0, end: 99 },
  { kind: 'thermalling', start: 100, end: 199 },
  { kind: 'gliding', start: 200, end: 300 }
];
const fixes = northbound(301);
const range = { inMs: 10_000, outMs: 290_000 };

describe('directCamera', () => {
  it('returns no keys for an empty range or flight', () => {
    expect(directCamera({ fixes }, phases, { inMs: 5000, outMs: 5000 })).toEqual([]);
    expect(directCamera({ fixes: [] }, phases, range)).toEqual([]);
  });

  it('returns three animated tracks with auto interp at the same times', () => {
    const tr = directTracks({ fixes }, phases, range);
    for (const p of [tr.heading, tr.pitch, tr.range]) {
      expect(p.animated).toBe(true);
      expect(p.keys.every((k) => k.interp === 'auto')).toBe(true);
      expect(p.keys.map((k) => k.t)).toEqual(tr.heading.keys.map((k) => k.t));
    }
  });

  it('keeps keys sorted and inside the range', () => {
    const keys = directCamera({ fixes }, phases, range);
    expect(keys.every((k, i) => i === 0 || keys[i - 1].t < k.t)).toBe(true);
    expect(keys.slice(1, -1).every((k) => k.t > range.inMs && k.t < range.outMs)).toBe(true);
  });

  it('opens with a wide establishing shot', () => {
    const [first] = directCamera({ fixes }, phases, range);
    expect(first).toMatchObject({ t: range.inMs, pitch: -35, range: 2500 });
    expect(headingDelta(0, first.heading)).toBeCloseTo(0, 0);
  });

  it('ends with a pull-back that keeps the heading', () => {
    const keys = directCamera({ fixes }, phases, range);
    const last = keys.at(-1)!;
    expect(last).toMatchObject({ t: range.outMs, pitch: -45, range: 4000 });
    expect(last.heading).toBe(keys.at(-2)!.heading);
  });

  it('chases the track on glides', () => {
    const keys = directCamera({ fixes }, phases, { inMs: 0, outMs: 50_000 });
    const chase = keys.filter((k) => k.range === 350);
    expect(chase.length).toBeGreaterThan(0);
    for (const k of chase) expect(Math.abs(headingDelta(0, k.heading))).toBeLessThan(1);
  });

  it('turns 90 degrees per key in thermals, continuously', () => {
    const keys = directCamera({ fixes }, phases, range).filter((k) => k.range === 450);
    expect(keys.length).toBeGreaterThan(2);
    for (let i = 1; i < keys.length; i++) expect(keys[i].heading - keys[i - 1].heading).toBe(90);
  });

  it('caps the number of keys and keeps the first and last', () => {
    const long = northbound(7201);
    const many: Phase[] = [{ kind: 'gliding', start: 0, end: 7200 }];
    const keys = directCamera({ fixes: long }, many, { inMs: 0, outMs: 7_200_000 });
    expect(keys).toHaveLength(MAX_KEYS);
    expect(keys[0].t).toBe(0);
    expect(keys.at(-1)!.t).toBe(7_200_000);
  });
});
