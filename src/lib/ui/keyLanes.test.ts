import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACKS, type PropTrack } from '../domain/cameraPath';
import {
  keyTimes,
  keysInBox,
  laneCurve,
  laneDelta,
  laneScale,
  mergeRefs,
  nextKeyTime,
  prevKeyTime,
  snapTime,
  valueY
} from './keyLanes';

describe('laneScale', () => {
  it('pads the values and gives flat values a band', () => {
    expect(laneScale([0, 10])).toEqual({ lo: -1, hi: 11 });
    const flat = laneScale([5, 5]);
    expect(flat.hi - flat.lo).toBeGreaterThan(0);
  });
});

describe('valueY and laneDelta', () => {
  const scale = { lo: 0, hi: 10 };

  it('puts the high end at the top and the low end at the bottom', () => {
    expect(valueY(10, scale, 26)).toBeCloseTo(3);
    expect(valueY(0, scale, 26)).toBeCloseTo(23);
  });

  it('turns a drag up into a rise in value', () => {
    const delta = laneDelta(-20, scale, 26);
    expect(delta).toBeGreaterThan(0);
    expect(laneDelta(20, scale, 26)).toBeCloseTo(-delta);
  });
});

describe('laneCurve', () => {
  const track: PropTrack = {
    animated: true,
    value: 0,
    keys: [
      { t: 0, v: 0, interp: 'linear' },
      { t: 1000, v: 10, interp: 'linear' }
    ]
  };

  it('draws a path over the window with a scale that fits it', () => {
    const { d, scale } = laneCurve('heading', track, 0, 1000, 100);
    expect(d.startsWith('M0.0,')).toBe(true);
    expect(scale.lo).toBeLessThan(0);
    expect(scale.hi).toBeGreaterThan(10);
  });
});

describe('snapTime', () => {
  it('snaps to the nearest target within the threshold', () => {
    expect(snapTime(1030, [1000, 2000], 50)).toEqual({ t: 1000, guide: 1000 });
  });

  it('leaves the time alone outside the threshold', () => {
    expect(snapTime(1100, [1000], 50)).toEqual({ t: 1100, guide: null });
  });
});

describe('keysInBox', () => {
  const points = [
    { prop: 'heading' as const, t: 1, x: 10, y: 10 },
    { prop: 'pitch' as const, t: 2, x: 50, y: 10 },
    { prop: 'range' as const, t: 3, x: 50, y: 50 }
  ];

  it('returns the keys inside the box whatever the drag direction', () => {
    expect(keysInBox(points, { x0: 60, y0: 20, x1: 0, y1: 0 })).toEqual([
      { prop: 'heading', t: 1 },
      { prop: 'pitch', t: 2 }
    ]);
  });

  it('returns nothing for an empty box', () => {
    expect(keysInBox(points, { x0: 500, y0: 500, x1: 500, y1: 500 })).toEqual([]);
  });
});

describe('mergeRefs', () => {
  it('unions selections without duplicates', () => {
    const merged = mergeRefs([{ prop: 'heading', t: 1 }], [{ prop: 'heading', t: 1 }, { prop: 'pitch', t: 1 }]);
    expect(merged).toHaveLength(2);
  });
});

describe('keyTimes, prevKeyTime, nextKeyTime', () => {
  it('lists the sorted unique times of all props', () => {
    const tracks = {
      ...DEFAULT_TRACKS,
      heading: { animated: true, value: 0, keys: [{ t: 2, v: 0, interp: 'auto' as const }] },
      pitch: { animated: true, value: 0, keys: [{ t: 1, v: 0, interp: 'auto' as const }, { t: 2, v: 0, interp: 'auto' as const }] }
    };
    expect(keyTimes(tracks)).toEqual([1, 2]);
  });

  it('finds neighbours and skips a key at the playhead', () => {
    const keys = [
      { t: 1000, v: 0, interp: 'auto' as const },
      { t: 2000, v: 0, interp: 'auto' as const }
    ];
    expect(prevKeyTime(keys, 2000)).toBe(1000);
    expect(nextKeyTime(keys, 1000)).toBe(2000);
    expect(prevKeyTime(keys, 1000)).toBeUndefined();
    expect(nextKeyTime(keys, 2000)).toBeUndefined();
  });
});
