import { describe, expect, it } from 'vitest';
import { decodeScene, encodeScene, DEFAULT_SCENE } from './scene';

describe('scene config', () => {
  it('round-trips through URL search params', () => {
    const scene = { flightIds: ['a', 'b'], camera: 'cockpit' as const, colorBy: 'phase' as const, layout: 'split' as const };

    expect(decodeScene(new URLSearchParams(encodeScene(scene)))).toEqual(scene);
  });

  it('falls back to defaults for missing or unknown values', () => {
    const scene = decodeScene(new URLSearchParams('f=a&camera=drone&layout=x'));

    expect(scene).toEqual({ ...DEFAULT_SCENE, flightIds: ['a'] });
  });

  it('returns no flights for empty params', () => {
    expect(decodeScene(new URLSearchParams()).flightIds).toEqual([]);
  });
});
