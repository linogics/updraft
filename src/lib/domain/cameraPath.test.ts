import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRACKS,
  MAX_KEYS,
  captureView,
  clearKeys,
  copyKeys,
  moveKeys,
  pasteKeys,
  parseTracks,
  removeKeys,
  setAnimated,
  setKey,
  setKeysInterp,
  setValueAt,
  shiftValues,
  timeSets,
  unwrapNear,
  valueAt,
  viewAt,
  type CameraTracks,
  type Interp,
  type Key,
  type PropTrack
} from './cameraPath';

const track = (keys: [number, number, Interp?][], animated = true, value = 0): PropTrack => ({
  animated,
  value,
  keys: keys.map(([t, v, interp = 'auto']) => ({ t, v, interp }))
});
const none = new Set<number>();
const set = (...ts: number[]) => new Set(ts);

describe('valueAt', () => {
  it('gives the constant value when not animated or without keys', () => {
    expect(valueAt(track([[0, 50]], false, 12), 500, 'heading')).toBe(12);
    expect(valueAt(track([], true, 12), 500, 'heading')).toBe(12);
  });

  it('clamps before the first and after the last key', () => {
    const tr = track([
      [1000, 10],
      [2000, 50]
    ]);
    expect(valueAt(tr, 0, 'heading')).toBe(10);
    expect(valueAt(tr, 3000, 'heading')).toBe(50);
  });

  it('holds the value of the key until the next key', () => {
    const tr = track([
      [0, 5, 'hold'],
      [1000, 50]
    ]);
    expect(valueAt(tr, 500, 'heading')).toBe(5);
    expect(valueAt(tr, 999, 'heading')).toBe(5);
  });

  it('interpolates linearly', () => {
    const tr = track([
      [0, 0, 'linear'],
      [1000, 100]
    ]);
    expect(valueAt(tr, 250, 'heading')).toBeCloseTo(25);
  });

  it('eases in and out with smoothstep', () => {
    const tr = track([
      [0, 0, 'ease'],
      [1000, 100]
    ]);
    expect(valueAt(tr, 500, 'heading')).toBeCloseTo(50);
    expect(valueAt(tr, 250, 'heading')).toBeCloseTo(15.625);
  });

  it('passes smoothly through the keys with auto (Catmull-Rom)', () => {
    const tr = track([
      [0, 0],
      [1000, 10],
      [2000, 20],
      [3000, 30]
    ]);
    expect(valueAt(tr, 1500, 'heading')).toBeCloseTo(15);
    expect(valueAt(tr, 2000, 'heading')).toBeCloseTo(20);
  });

  it('interpolates range in log space', () => {
    const tr = track([
      [0, 100, 'linear'],
      [1000, 400]
    ]);
    expect(valueAt(tr, 500, 'range')).toBeCloseTo(200);
  });

  it('clamps pitch and range on output', () => {
    expect(valueAt(track([[0, 10]]), 0, 'pitch')).toBe(0);
    expect(valueAt(track([[0, -120]]), 0, 'pitch')).toBe(-89);
    expect(valueAt(track([[0, 5]]), 0, 'range')).toBe(40);
    expect(valueAt(track([[0, 99_999]]), 0, 'range')).toBe(20_000);
  });

  it('keeps heading unwrapped through north', () => {
    const tr = track([
      [0, 350, 'linear'],
      [1000, 370]
    ]);
    expect(valueAt(tr, 500, 'heading')).toBeCloseTo(360);
  });
});

describe('viewAt', () => {
  it('combines the three tracks', () => {
    const tracks: CameraTracks = {
      heading: track([
        [0, 0, 'linear'],
        [1000, 100]
      ]),
      pitch: track([[0, -20]], false, -20),
      range: track([[0, 300]], false, 300)
    };
    expect(viewAt(tracks, 500)).toEqual({ heading: 50, pitch: -20, range: 300 });
  });
});

describe('unwrapNear', () => {
  it('moves an angle by whole turns to the value nearest the reference', () => {
    expect(unwrapNear(10, 350)).toBe(370);
    expect(unwrapNear(350, 10)).toBe(-10);
    expect(unwrapNear(90, 100)).toBe(90);
  });
});

describe('setKey', () => {
  it('inserts a key in time order with auto interp', () => {
    const tr = setKey(
      track([
        [0, 1],
        [2000, 3]
      ]),
      'pitch',
      1000,
      -30
    );
    expect(tr.keys.map((k) => [k.t, k.v, k.interp])).toEqual([
      [0, 1, 'auto'],
      [1000, -30, 'auto'],
      [2000, 3, 'auto']
    ]);
  });

  it('replaces the key within 1 ms and keeps its interp', () => {
    const tr = setKey(track([[1000, 5, 'hold']]), 'range', 1000.5, 800);
    expect(tr.keys).toEqual([{ t: 1000.5, v: 800, interp: 'hold' }]);
  });

  it('unwraps heading near the previous key', () => {
    const tr = setKey(track([[0, 350]]), 'heading', 1000, 10);
    expect(tr.keys[1].v).toBe(370);
  });

  it('does not unwrap pitch', () => {
    const tr = setKey(track([[0, -10]]), 'pitch', 1000, -350);
    expect(tr.keys[1].v).toBe(-89);
  });

  it('refuses a new key beyond MAX_KEYS but still replaces', () => {
    const full = track(Array.from({ length: MAX_KEYS }, (_, i) => [i * 10, 1] as [number, number]));
    expect(setKey(full, 'pitch', 99_999, -20)).toBe(full);
    expect(setKey(full, 'pitch', 0, -20).keys).toHaveLength(MAX_KEYS);
  });
});

describe('removeKeys', () => {
  it('removes keys at the given times', () => {
    const tr = removeKeys(
      track([
        [0, 1],
        [1000, 2],
        [2000, 3]
      ]),
      set(1000)
    );
    expect(tr.keys.map((k) => k.t)).toEqual([0, 2000]);
  });

  it('keeps the value the last key showed when all keys go', () => {
    const tr = removeKeys(track([[0, 7]]), set(0));
    expect(tr.keys).toEqual([]);
    expect(tr.animated).toBe(true);
    expect(tr.value).toBe(7);
  });
});

describe('moveKeys', () => {
  it('shifts the picked keys and keeps the order', () => {
    const tr = moveKeys(
      track([
        [0, 1],
        [1000, 2],
        [2000, 3]
      ]),
      set(0, 1000),
      1500
    );
    expect(tr.keys.map((k) => [k.t, k.v])).toEqual([
      [1500, 1],
      [2000, 3],
      [2500, 2]
    ]);
  });

  it('replaces an unmoved key that the moved key lands on', () => {
    const tr = moveKeys(
      track([
        [0, 1],
        [1000, 2]
      ]),
      set(0),
      1000
    );
    expect(tr.keys.map((k) => [k.t, k.v])).toEqual([[1000, 1]]);
  });
});

describe('setKeysInterp', () => {
  it('sets interp on the picked keys only', () => {
    const tr = setKeysInterp(
      track([
        [0, 1],
        [1000, 2]
      ]),
      set(1000),
      'ease'
    );
    expect(tr.keys.map((k) => k.interp)).toEqual(['auto', 'ease']);
  });
});

describe('setAnimated', () => {
  it('turning on adds one key at the playhead with the shown value', () => {
    const tr = setAnimated(track([], false, 42), true, 5000, 42);
    expect(tr).toEqual({ animated: true, value: 42, keys: [{ t: 5000, v: 42, interp: 'auto' }] });
  });

  it('turning off removes all keys and keeps the shown value', () => {
    const tr = setAnimated(
      track([
        [0, 1],
        [1000, 9]
      ]),
      false,
      500,
      5
    );
    expect(tr).toEqual({ animated: false, value: 5, keys: [] });
  });
});

describe('setValueAt', () => {
  it('changes the constant when not animated', () => {
    const tr = setValueAt(track([], false, 1), 'pitch', 0, -200);
    expect(tr).toEqual({ animated: false, value: -89, keys: [] });
  });

  it('sets a key at the playhead when animated', () => {
    const tr = setValueAt(track([[0, 1]]), 'pitch', 500, -30);
    expect(tr.keys.map((k) => [k.t, k.v])).toEqual([
      [0, 1],
      [500, -30]
    ]);
  });
});

describe('shiftValues', () => {
  it('moves range by a log step', () => {
    const tr = shiftValues(track([[0, 100]]), 'range', set(0), Math.log(2));
    expect(tr.keys[0].v).toBeCloseTo(200);
  });
});

describe('copy and paste', () => {
  const tracks: CameraTracks = {
    heading: track([
      [1000, 10],
      [3000, 20]
    ]),
    pitch: track([[3000, -30, 'hold']]),
    range: track(
      [
        [1000, 300],
        [3000, 400]
      ],
      false,
      300
    )
  };

  it('copies picked keys relative to the first one', () => {
    const clip = copyKeys(
      tracks,
      timeSets([
        { prop: 'heading', t: 1000 },
        { prop: 'pitch', t: 3000 }
      ])
    )!;
    expect(clip.heading).toEqual([{ t: 0, v: 10, interp: 'auto' }]);
    expect(clip.pitch).toEqual([{ t: 2000, v: -30, interp: 'hold' }]);
    expect(clip.range).toBeUndefined();
  });

  it('returns null when nothing is picked', () => {
    expect(copyKeys(tracks, timeSets([]))).toBeNull();
  });

  it('pastes at a time keeping the spacing and skips tracks not animated', () => {
    const clip = copyKeys(
      tracks,
      timeSets([
        { prop: 'heading', t: 1000 },
        { prop: 'heading', t: 3000 }
      ])
    )!;
    const out = pasteKeys(tracks, clip, 10_000);
    expect(out.heading.keys.map((k) => k.t)).toEqual([1000, 3000, 10_000, 12_000]);
    expect(out.heading.keys.at(-1)!.v).toBe(20);
    expect(out.range).toBe(tracks.range);
  });
});

describe('captureView', () => {
  it('animates every track and keys the view at t', () => {
    const view = { heading: 90, pitch: -25, range: 450 };
    const tr = captureView(DEFAULT_TRACKS, view, 1000);
    expect(tr.heading).toEqual({ animated: true, value: 0, keys: [{ t: 1000, v: 90, interp: 'auto' }] });
    expect(tr.pitch.keys[0].v).toBe(-25);
    expect(tr.range.keys[0].v).toBe(450);
  });
});

describe('clearKeys', () => {
  it('stops every track at the value shown at t', () => {
    const tracks: CameraTracks = {
      heading: track([
        [0, 30],
        [1000, 60]
      ]),
      pitch: track([[0, -20]]),
      range: track([[0, 300]])
    };
    const out = clearKeys(tracks, 500);
    expect(out.heading).toEqual({ animated: false, value: 45, keys: [] });
    expect(out.pitch).toEqual({ animated: false, value: -20, keys: [] });
  });
});

describe('parseTracks', () => {
  const good = {
    heading: {
      animated: true,
      value: 0,
      keys: [
        { t: 2000, v: 40, interp: 'hold' },
        { t: 1000, v: 10, interp: 'linear' }
      ]
    },
    pitch: { animated: false, value: -30, keys: [] },
    range: { animated: true, value: 300, keys: [{ t: 0, v: 5, interp: 'auto' }] }
  };

  it('reads the new format, sorting keys and clamping limits', () => {
    const tr = parseTracks(good);
    expect(tr.heading.keys.map((k) => k.t)).toEqual([1000, 2000]);
    expect(tr.heading.keys[1].interp).toBe('hold');
    expect(tr.pitch).toEqual({ animated: false, value: -30, keys: [] });
    expect(tr.range.keys[0].v).toBe(40);
  });

  it('drops non-finite numbers and falls back to auto for unknown interp', () => {
    const tr = parseTracks({
      ...good,
      heading: {
        animated: true,
        value: Number.NaN,
        keys: [
          { t: 1, v: 2, interp: 'bogus' },
          { t: Number.POSITIVE_INFINITY, v: 2, interp: 'linear' },
          { t: 3, v: '4', interp: 'linear' },
          null
        ]
      }
    });
    expect(tr.heading.value).toBe(0);
    expect(tr.heading.keys).toEqual([{ t: 1, v: 2, interp: 'auto' }]);
  });

  it('caps each track at MAX_KEYS', () => {
    const keys = Array.from({ length: MAX_KEYS + 20 }, (_, i) => ({ t: i, v: 1, interp: 'auto' }));
    expect(parseTracks({ ...good, heading: { animated: true, value: 0, keys } }).heading.keys).toHaveLength(MAX_KEYS);
  });

  it('falls back to the defaults for the old keyframe array', () => {
    const old = [{ t: 1000, heading: 10, pitch: -20, range: 300 }];
    expect(parseTracks(old)).toEqual(DEFAULT_TRACKS);
  });

  it('falls back to the defaults for garbage', () => {
    expect(parseTracks(null)).toEqual(DEFAULT_TRACKS);
    expect(parseTracks('junk')).toEqual(DEFAULT_TRACKS);
    expect(parseTracks({ heading: 5 })).toEqual(DEFAULT_TRACKS);
  });
});

describe('pure helpers', () => {
  it('does not mutate its input', () => {
    const before: Key[] = [{ t: 0, v: 1, interp: 'auto' }];
    const tr = track([[0, 1]]);
    setKey(tr, 'pitch', 500, -20);
    moveKeys(tr, none, 0);
    expect(tr.keys).toEqual(before);
  });
});
