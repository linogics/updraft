import { describe, expect, it } from 'vitest';

import { decodeScene, DEFAULT_SCENE, encodeScene, resolveTerrain, type SceneConfig } from './scene';

describe('scene config', () => {
  it('round-trips through URL search params', () => {
    const scene: SceneConfig = {
      flightIds: ['a', 'b'],
      camera: 'cockpit',
      colorBy: 'phase',
      layout: 'split',
      basemap: 'topo',
      terrain: 'none',
      sync: 'takeoff',
      nudges: { b: 90_000 },
      thermalFilter: { minGain: 250, minClimb: 1.2 },
      trackStyle: 'dashed',
      trackWidth: 5,
      smoothTrack: false,
      colors: { a: '#ff8800' },
      exaggeration: 2.5,
      lighting: true,
      labels: false
    };

    expect(decodeScene(new URLSearchParams(encodeScene(scene)))).toEqual(scene);
  });

  it('falls back to defaults for missing or unknown values', () => {
    const scene = decodeScene(new URLSearchParams('f=a&camera=drone&layout=x&map=moon&terrain=lava&sync=never'));

    expect(scene).toEqual({ ...DEFAULT_SCENE, flightIds: ['a'] });
  });

  it('leaves terrain and sync unset when absent so the app picks a default', () => {
    const scene = decodeScene(new URLSearchParams('f=a'));

    expect(scene.terrain).toBeNull();
    expect(scene.sync).toBeNull();
  });

  it('returns no flights for empty params', () => {
    expect(decodeScene(new URLSearchParams()).flightIds).toEqual([]);
  });

  it('encodes nudges in whole seconds and ignores malformed ones', () => {
    const query = encodeScene({ ...DEFAULT_SCENE, flightIds: ['a'], nudges: { a: -2400, b: 0 } });

    expect(new URLSearchParams(query).getAll('nudge')).toEqual(['a:-2']);
    expect(decodeScene(new URLSearchParams('nudge=a:12&nudge=b&nudge=c:x&nudge=:3')).nudges).toEqual({ a: 12_000 });
  });
});

describe('view toggles', () => {
  it('omits defaults from the URL', () => {
    const params = new URLSearchParams(encodeScene({ ...DEFAULT_SCENE, flightIds: ['a'] }));

    expect(params.has('exag') || params.has('sun') || params.has('labels') || params.has('smooth')).toBe(false);
  });

  it('clamps exaggeration to 1-3 in 0.1 steps and ignores junk', () => {
    expect(decodeScene(new URLSearchParams('exag=9')).exaggeration).toBe(3);
    expect(decodeScene(new URLSearchParams('exag=0.2')).exaggeration).toBe(1);
    expect(decodeScene(new URLSearchParams('exag=1.74')).exaggeration).toBe(1.7);
    expect(decodeScene(new URLSearchParams('exag=x')).exaggeration).toBe(1);
  });
});

describe('resolveTerrain', () => {
  it('defaults to ion with a token and to the free tiles without', () => {
    expect(resolveTerrain(null, true)).toBe('ion');
    expect(resolveTerrain(null, false)).toBe('terrarium');
  });

  it('falls back when ion is requested without a token', () => {
    expect(resolveTerrain('ion', false)).toBe('terrarium');
  });

  it('keeps an explicit choice that is available', () => {
    expect(resolveTerrain('none', true)).toBe('none');
    expect(resolveTerrain('terrarium', true)).toBe('terrarium');
  });

  it('writes the thermal filter only when it differs from the default', () => {
    const plain = new URLSearchParams(encodeScene({ ...DEFAULT_SCENE, flightIds: ['a'] }));
    expect(plain.has('tgain')).toBe(false);
    expect(plain.has('tclimb')).toBe(false);

    const query = new URLSearchParams(encodeScene({ ...DEFAULT_SCENE, thermalFilter: { minGain: 300, minClimb: 0 } }));
    expect(query.get('tgain')).toBe('300');
    expect(query.has('tclimb')).toBe(false);
  });

  it('ignores invalid or negative thermal filter values', () => {
    const scene = decodeScene(new URLSearchParams('tgain=-5&tclimb=fast'));

    expect(scene.thermalFilter).toEqual(DEFAULT_SCENE.thermalFilter);
  });

  it('writes track style, width and colours only when set', () => {
    const plain = new URLSearchParams(encodeScene({ ...DEFAULT_SCENE, flightIds: ['a'] }));
    expect(['style', 'width', 'pc'].filter((k) => plain.has(k))).toEqual([]);
  });

  it('clamps the track width and rejects unknown styles', () => {
    expect(decodeScene(new URLSearchParams('width=40')).trackWidth).toBe(10);
    expect(decodeScene(new URLSearchParams('width=0')).trackWidth).toBe(1);
    expect(decodeScene(new URLSearchParams('width=wide')).trackWidth).toBe(DEFAULT_SCENE.trackWidth);
    expect(decodeScene(new URLSearchParams('style=sparkles')).trackStyle).toBe(DEFAULT_SCENE.trackStyle);
  });

  it('accepts only six-digit hex pilot colours', () => {
    const scene = decodeScene(new URLSearchParams('pc=a:%2300ff88&pc=b:red&pc=c:%23abc&pc=d:%23ABCDEF'));

    expect(scene.colors).toEqual({ a: '#00ff88', d: '#abcdef' });
  });
});
