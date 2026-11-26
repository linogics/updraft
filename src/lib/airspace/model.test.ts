import { describe, expect, it } from 'vitest';

import { UNIT_PRESETS } from '../ui/units';
import { airspaceLabel, classOf, formatLimit, isVisible, limitOf, volumeHeights } from './model';

const tma = {
  source_id: '69bb951a51e402d2a077d772',
  name: 'TMA BERN 1',
  type: 'tma',
  icao_class: 'd',
  lower_limit_value: 3500,
  lower_limit_unit: 'FT',
  lower_limit_reference_datum: 'MSL',
  upper_limit_value: 100,
  upper_limit_unit: 'FL',
  upper_limit_reference_datum: 'STD'
};

describe('limitOf', () => {
  it('converts feet, flight levels and metres', () => {
    expect(limitOf(3500, 'FT', 'MSL')).toEqual({ value: 1066.8, ref: 'MSL' });
    expect(limitOf(100, 'FL', 'STD')).toEqual({ value: 3048, ref: 'STD' });
    expect(limitOf(0, 'FT', 'GND')).toEqual({ value: 0, ref: 'GND' });
    expect(limitOf(500, 'M', 'MSL')).toEqual({ value: 500, ref: 'MSL' });
  });
});

describe('classOf', () => {
  it('maps letters and falls back to other', () => {
    expect(classOf('d')).toBe('D');
    expect(classOf('unclassified')).toBe('other');
    expect(classOf(undefined)).toBe('other');
  });
});

describe('isVisible', () => {
  const prefs = { classes: ['D' as const], maxFloor: 2000 };
  it('filters by class and floor', () => {
    expect(isVisible(tma, prefs)).toBe(true);
    expect(isVisible({ ...tma, icao_class: 'c' }, prefs)).toBe(false);
    expect(isVisible({ ...tma, lower_limit_value: 3000, lower_limit_unit: 'M' }, prefs)).toBe(false);
    expect(isVisible({ ...tma, lower_limit_value: 9000, lower_limit_reference_datum: 'GND' }, prefs)).toBe(true);
  });
});

describe('volumeHeights', () => {
  it('scales metres and starts GND floors at zero', () => {
    expect(volumeHeights(tma, 2)).toEqual({ floor: 2133.6, ceiling: 6096 });
    expect(volumeHeights({ ...tma, lower_limit_value: 50, lower_limit_reference_datum: 'GND' }, 1).floor).toBe(0);
  });
});

describe('labels', () => {
  it('formats limits in the display units', () => {
    expect(formatLimit(limitOf(3500, 'FT', 'MSL'), UNIT_PRESETS.metric)).toBe('1067 m MSL');
    expect(formatLimit(limitOf(3500, 'FT', 'MSL'), UNIT_PRESETS.imperial)).toBe('3500 ft MSL');
    expect(formatLimit(limitOf(100, 'FL', 'STD'), UNIT_PRESETS.metric)).toBe('FL 100');
    expect(formatLimit(limitOf(0, 'FT', 'GND'), UNIT_PRESETS.metric)).toBe('GND');
  });

  it('builds the popup line', () => {
    expect(airspaceLabel(tma, UNIT_PRESETS.imperial)).toBe('TMA BERN 1, class D, 3500 ft MSL to FL 100');
  });
});
