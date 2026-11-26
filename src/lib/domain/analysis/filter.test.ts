import { describe, expect, it } from 'vitest';

import type { Thermal } from '../model';
import { DEFAULT_FILTER, filterThermals } from './filter';

const thermal = (gain: number, avgClimb: number, start = 0): Thermal => ({
  start,
  end: start + 10,
  duration: avgClimb > 0 ? gain / avgClimb : 10,
  entryAlt: 1000,
  exitAlt: 1000 + gain,
  gain,
  avgClimb,
  maxClimb: avgClimb * 2,
  centerLat: 47,
  centerLon: 11
});

describe('filterThermals', () => {
  const weak = thermal(80, 0.6, 0);
  const strong = thermal(900, 2.8, 20);
  const tallButSlow = thermal(600, 0.9, 40);
  const sinking = thermal(-30, -0.2, 60);

  it('keeps every climbing thermal with the default filter', () => {
    expect(filterThermals([weak, strong, tallButSlow, sinking], DEFAULT_FILTER)).toEqual([weak, strong, tallButSlow]);
  });

  it('drops thermals below the minimum gain', () => {
    expect(filterThermals([weak, strong, tallButSlow], { minGain: 500, minClimb: 0 })).toEqual([strong, tallButSlow]);
  });

  it('drops thermals below the minimum average climb', () => {
    expect(filterThermals([weak, strong, tallButSlow], { minGain: 0, minClimb: 1 })).toEqual([strong]);
  });

  it('applies both thresholds together', () => {
    expect(filterThermals([weak, strong, tallButSlow], { minGain: 100, minClimb: 0.8 })).toEqual([strong, tallButSlow]);
  });
});
