import { describe, expect, it } from 'vitest';

import type { Transition } from './analysis/transitions';
import { glideProfile, groundGlide, groundSpeed, heightNeeded, rayRange, validGlideInput } from './glide';

const p = { ld: 10, airspeed: 10, windSpeed: 0, windFrom: 0, margin: 100 };

describe('groundSpeed', () => {
  it('equals airspeed in still air', () => expect(groundSpeed(123, p)).toBeCloseTo(10));
  it('adds a tailwind and subtracts a headwind', () => {
    // Wind from the north blows south.
    const w = { ...p, windSpeed: 4, windFrom: 0 };
    expect(groundSpeed(180, w)).toBeCloseTo(14);
    expect(groundSpeed(0, w)).toBeCloseTo(6);
  });
  it('crabs in a crosswind', () => {
    expect(groundSpeed(90, { ...p, windSpeed: 6, windFrom: 0 })).toBeCloseTo(8);
  });
  it('is 0 when the wind beats the glider', () => {
    expect(groundSpeed(0, { ...p, windSpeed: 12, windFrom: 0 })).toBe(0);
    expect(groundSpeed(90, { ...p, windSpeed: 12, windFrom: 0 })).toBe(0);
  });
});

describe('groundGlide and heightNeeded', () => {
  it('scales L/D by the ground speed ratio', () => {
    expect(groundGlide(0, { ...p, windSpeed: 5, windFrom: 0 })).toBeCloseTo(5);
  });
  it('adds the margin to the loss', () => {
    expect(heightNeeded(5000, 0, p)).toBeCloseTo(600);
  });
  it('is null when unreachable', () => {
    expect(heightNeeded(5000, 0, { ...p, windSpeed: 11, windFrom: 0 })).toBeNull();
  });
});

describe('rayRange', () => {
  const flat = new Array(20).fill(0);
  it('flies the whole ray over flat ground when height suffices', () => {
    expect(rayRange(1000, 10, 100, 100, flat)).toBe(2000);
  });
  it('stops where height runs out', () => {
    // Loss at d is d/10, so 1000 m high with a 100 m margin gives 9000 m, beyond the ray.
    expect(rayRange(300, 10, 100, 100, flat)).toBe(2000);
    expect(rayRange(110, 10, 100, 100, flat)).toBe(100);
  });
  it('is cut by a ridge', () => {
    const ground = flat.map((_, k) => (k === 7 ? 900 : 0));
    expect(rayRange(1000, 10, 100, 100, ground)).toBe(700);
  });
});

describe('glideProfile', () => {
  const t = (o: Partial<Transition>): Transition => ({
    kind: 'glide',
    start: 0,
    end: 1,
    duration: 100,
    startAlt: 2000,
    endAlt: 1900,
    altLoss: 100,
    distance: 2000,
    trackDistance: 2050,
    speed: 10,
    glideRatio: 20,
    ...o
  });
  it('takes medians of straight glides only', () => {
    const r = glideProfile([
      t({ glideRatio: 10, speed: 8 }),
      t({ glideRatio: 14, speed: 10 }),
      t({ glideRatio: 30, speed: 12 }),
      t({ glideRatio: 99, kind: 'final' }),
      t({ glideRatio: 99, distance: 500 }),
      t({ glideRatio: 99, trackDistance: 4000 }),
      t({ glideRatio: null })
    ]);
    expect(r).toEqual({ ld: 14, speed: 10, count: 3 });
  });
  it('is null without samples', () => expect(glideProfile([])).toBeNull());
});

describe('validGlideInput', () => {
  it('rejects values the math cannot use', () => {
    expect(validGlideInput('ld', 0.5)).toBe(false);
    expect(validGlideInput('airspeed', 0)).toBe(false);
    expect(validGlideInput('windSpeed', -1)).toBe(false);
    expect(validGlideInput('margin', -1)).toBe(false);
    expect(validGlideInput('altitude', -1)).toBe(false);
    expect(validGlideInput('altitude', NaN)).toBe(false);
  });
  it('accepts sane values', () => {
    expect(validGlideInput('ld', 8)).toBe(true);
    expect(validGlideInput('windFrom', 0)).toBe(true);
    expect(validGlideInput('margin', 0)).toBe(true);
  });
});
