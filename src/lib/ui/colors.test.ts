import { describe, expect, it } from 'vitest';

import { phaseColor, pilotColor, varioColor } from './colors';

describe('colors', () => {
  it('gives distinct pilot colours and wraps around', () => {
    expect(pilotColor(0)).not.toBe(pilotColor(1));
    expect(pilotColor(0)).toBe(pilotColor(8));
  });

  it('maps vario to a diverging scale with neutral at zero', () => {
    expect(varioColor(0)).toBe('#e5e5e5');
    expect(varioColor(5)).toBe(varioColor(10));
    expect(varioColor(-5)).toBe(varioColor(-10));
    expect(varioColor(3)).not.toBe(varioColor(-3));
  });

  it('has a colour per phase', () => {
    expect(new Set([phaseColor('thermalling'), phaseColor('gliding'), phaseColor('searching')]).size).toBe(3);
  });
});
