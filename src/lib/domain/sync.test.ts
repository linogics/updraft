import { describe, expect, it } from 'vitest';
import type { Fix } from './model';
import { defaultSyncMode, shiftFixes, snapStart, syncOffsets } from './sync';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Track from `start` to `end` (ms), one fix per minute. */
function track(start: number, end: number): Fix[] {
  const fixes: Fix[] = [];
  for (let t = start; t <= end; t += 60_000) fixes.push({ t, lat: 47.6, lon: 11.5, alt: 1500 });
  return fixes;
}

const day1 = Date.UTC(2026, 6, 15);
const day2 = Date.UTC(2026, 6, 20);

describe('syncOffsets', () => {
  const a = track(day1 + 10 * HOUR, day1 + 12 * HOUR);
  const b = track(day2 + 11 * HOUR, day2 + 13 * HOUR);

  it('keeps real time unchanged', () => {
    expect(syncOffsets([a, b], 'real')).toEqual([0, 0]);
  });

  it('moves every flight onto the first flight day, keeping time of day', () => {
    const [oa, ob] = syncOffsets([a, b], 'timeOfDay');

    expect(oa).toBe(0);
    expect(ob).toBe(-5 * DAY);
    expect(b[0].t + ob).toBe(day1 + 11 * HOUR);
  });

  it('aligns takeoffs to the first flight', () => {
    const [oa, ob] = syncOffsets([a, b], 'takeoff');

    expect(oa).toBe(0);
    expect(b[0].t + ob).toBe(a[0].t);
  });

  it('handles an empty list', () => {
    expect(syncOffsets([], 'timeOfDay')).toEqual([]);
  });
});

describe('defaultSyncMode', () => {
  it('uses real time when all flights start on the same UTC day', () => {
    expect(defaultSyncMode([track(day1 + 9 * HOUR, day1 + 10 * HOUR), track(day1 + 13 * HOUR, day1 + 14 * HOUR)])).toBe(
      'real'
    );
  });

  it('uses time of day when flights start on different days', () => {
    expect(defaultSyncMode([track(day1 + 9 * HOUR, day1 + 10 * HOUR), track(day2 + 9 * HOUR, day2 + 10 * HOUR)])).toBe(
      'timeOfDay'
    );
  });
});

describe('shiftFixes', () => {
  it('shifts timestamps and keeps positions', () => {
    const fixes = track(day1, day1 + 60_000);
    const shifted = shiftFixes(fixes, 1000);

    expect(shifted.map((f) => f.t)).toEqual([day1 + 1000, day1 + 61_000]);
    expect(shifted[0]).toMatchObject({ lat: 47.6, lon: 11.5, alt: 1500 });
  });

  it('returns the same array for a zero offset', () => {
    const fixes = track(day1, day1 + 60_000);
    expect(shiftFixes(fixes, 0)).toBe(fixes);
  });

  it('never mutates the input', () => {
    const fixes = track(day1, day1 + 60_000);
    shiftFixes(fixes, 5000);
    expect(fixes[0].t).toBe(day1);
  });
});

describe('snapStart', () => {
  const duration = 1000;

  it('snaps the clip start to a nearby target', () => {
    expect(snapStart(5030, duration, [5000, 9000], 50)).toEqual({ start: 5000, guide: 5000 });
  });

  it('snaps the clip end to a nearby target', () => {
    expect(snapStart(7980, duration, [9000], 50)).toEqual({ start: 8000, guide: 9000 });
  });

  it('prefers the closest edge', () => {
    // Start is 40 away from 5000, end is 10 away from 6050.
    expect(snapStart(5040, duration, [5000, 6050], 50)).toEqual({ start: 5050, guide: 6050 });
  });

  it('does not snap beyond the threshold', () => {
    expect(snapStart(5100, duration, [5000], 50)).toEqual({ start: 5100, guide: null });
  });
});
