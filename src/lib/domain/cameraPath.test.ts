import { describe, expect, it } from 'vitest';
import { MAX_KEYS, cameraAt, clampKey, parseKeys, sortKeys, unwrapNear, type Keyframe } from './cameraPath';

const key = (t: number, heading = 0, pitch = -20, range = 300): Keyframe => ({ t, heading, pitch, range });

describe('cameraAt', () => {
  it('returns undefined without keys', () => {
    expect(cameraAt([], 1000)).toBeUndefined();
  });

  it('returns the only key at any time', () => {
    const k = key(1000, 90, -30, 500);
    expect(cameraAt([k], 0)).toEqual({ heading: 90, pitch: -30, range: 500 });
    expect(cameraAt([k], 5000)).toEqual({ heading: 90, pitch: -30, range: 500 });
  });

  it('clamps before the first and after the last key', () => {
    const keys = [key(1000, 10, -20, 300), key(2000, 50, -40, 600)];
    expect(cameraAt(keys, 0)).toEqual({ heading: 10, pitch: -20, range: 300 });
    expect(cameraAt(keys, 3000)).toEqual({ heading: 50, pitch: -40, range: 600 });
  });

  it('hits a key exactly', () => {
    const keys = [key(0, 0), key(1000, 40, -30, 500), key(2000, 80, -10, 200)];
    const v = cameraAt(keys, 1000)!;
    expect(v.heading).toBeCloseTo(40);
    expect(v.pitch).toBeCloseTo(-30);
    expect(v.range).toBeCloseTo(500);
  });

  it('is halfway between two keys at their midpoint', () => {
    const keys = [key(0, 0, -20, 100), key(1000, 100, -40, 400)];
    const v = cameraAt(keys, 500)!;
    expect(v.heading).toBeCloseTo(50);
    expect(v.pitch).toBeCloseTo(-30);
    expect(v.range).toBeCloseTo(200);
  });

  it('interpolates an unwrapped heading through north the short way', () => {
    const keys = [key(0, 350), key(1000, 370)];
    expect(cameraAt(keys, 500)!.heading).toBeCloseTo(360);
    expect(cameraAt(keys, 250)!.heading).toBeGreaterThan(350);
    expect(cameraAt(keys, 250)!.heading).toBeLessThan(360);
    expect(cameraAt(keys, 750)!.heading).toBeGreaterThan(360);
  });

  it('keeps pitch within its limits on overshoot', () => {
    const keys = [key(0, 0, -1), key(1000, 0, -1), key(2000, 0, -88), key(3000, 0, -88)];
    for (let t = 0; t <= 3000; t += 100) {
      const { pitch } = cameraAt(keys, t)!;
      expect(pitch).toBeLessThanOrEqual(0);
      expect(pitch).toBeGreaterThanOrEqual(-89);
    }
  });
});

describe('unwrapNear', () => {
  it('moves an angle by whole turns to the value nearest the reference', () => {
    expect(unwrapNear(10, 350)).toBe(370);
    expect(unwrapNear(350, 10)).toBe(-10);
    expect(unwrapNear(90, 100)).toBe(90);
  });
});

describe('parseKeys', () => {
  it('returns nothing for non-arrays', () => {
    expect(parseKeys(null)).toEqual([]);
    expect(parseKeys({ t: 1 })).toEqual([]);
  });

  it('drops entries with non-finite or missing numbers', () => {
    const raw = [
      key(1000),
      { t: 2000, heading: Number.NaN, pitch: -20, range: 300 },
      { t: 3000, heading: 0, pitch: Infinity, range: 300 },
      { t: '4000', heading: 0, pitch: -20, range: 300 },
      { t: 5000, heading: 0, pitch: -20 },
      null,
      'junk'
    ];
    expect(parseKeys(raw)).toEqual([key(1000)]);
  });

  it('clamps pitch and range', () => {
    expect(clampKey({ t: 0, heading: 0, pitch: 10, range: 5 })).toEqual({ t: 0, heading: 0, pitch: 0, range: 40 });
    expect(clampKey({ t: 0, heading: 0, pitch: -120, range: 99_999 })).toEqual({
      t: 0,
      heading: 0,
      pitch: -89,
      range: 20_000
    });
  });

  it('sorts by time and caps the count', () => {
    const raw = Array.from({ length: MAX_KEYS + 50 }, (_, i) => key(MAX_KEYS + 50 - i));
    const keys = parseKeys(raw);
    expect(keys).toHaveLength(MAX_KEYS);
    expect(keys[0].t).toBe(1);
    expect(keys.every((k, i) => i === 0 || keys[i - 1].t <= k.t)).toBe(true);
  });
});

describe('sortKeys', () => {
  it('returns a sorted copy', () => {
    const keys = [key(3), key(1), key(2)];
    expect(sortKeys(keys).map((k) => k.t)).toEqual([1, 2, 3]);
    expect(keys[0].t).toBe(3);
  });
});
