import { describe, expect, it } from 'vitest';
import { altitudeOffset, MAX_AUTO_OFFSET } from './align';

describe('altitudeOffset', () => {
  it('moves the takeoff fix onto the ground', () => {
    expect(altitudeOffset(1450, 1497)).toBe(47);
    expect(altitudeOffset(1520, 1497)).toBe(-23);
  });

  it('ignores implausible differences (logger started in the air, bad terrain sample)', () => {
    expect(altitudeOffset(2500, 1497)).toBe(0);
    expect(altitudeOffset(1497 - MAX_AUTO_OFFSET - 1, 1497)).toBe(0);
  });

  it('returns 0 without a terrain sample', () => {
    expect(altitudeOffset(1450, undefined)).toBe(0);
  });
});
