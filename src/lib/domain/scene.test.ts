import { describe, expect, it } from 'vitest';
import { decodeScene, encodeScene, DEFAULT_SCENE, resolveTerrain, type SceneConfig } from './scene';

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
      nudges: { b: 90_000 }
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
});
