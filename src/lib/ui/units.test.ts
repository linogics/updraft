import { describe, expect, it } from 'vitest';

import {
  formatAlt,
  formatDistance,
  formatSpeed,
  formatVario,
  fromAlt,
  fromVario,
  parseUnits,
  presetOf,
  toAlt,
  toDistance,
  toSpeed,
  toVario,
  UNIT_PRESETS,
  type Units
} from './units';

const { metric, imperial, aviation } = UNIT_PRESETS;

describe('unit conversion', () => {
  it('converts altitude to feet and back', () => {
    expect(toAlt(1000, 'ft')).toBeCloseTo(3280.84, 2);
    expect(fromAlt(toAlt(1234, 'ft'), 'ft')).toBeCloseTo(1234, 9);
    expect(toAlt(1000, 'm')).toBe(1000);
  });

  it('converts vario to ft/min and knots and back', () => {
    expect(toVario(1, 'fpm')).toBeCloseTo(196.85, 2);
    expect(toVario(1, 'kt')).toBeCloseTo(1.9438, 4);
    expect(fromVario(toVario(2.5, 'fpm'), 'fpm')).toBeCloseTo(2.5, 9);
    expect(fromVario(toVario(2.5, 'kt'), 'kt')).toBeCloseTo(2.5, 9);
  });

  it('converts speed to km/h, mph and knots', () => {
    expect(toSpeed(10, 'kmh')).toBeCloseTo(36, 9);
    expect(toSpeed(10, 'mph')).toBeCloseTo(22.369, 3);
    expect(toSpeed(10, 'kt')).toBeCloseTo(19.438, 3);
  });

  it('converts distance to km, miles and nautical miles', () => {
    expect(toDistance(10_000, 'km')).toBe(10);
    expect(toDistance(1609.344, 'mi')).toBeCloseTo(1, 9);
    expect(toDistance(1852, 'nm')).toBeCloseTo(1, 9);
  });
});

describe('unit formatting', () => {
  it('formats altitude', () => {
    expect(formatAlt(1234.4, metric)).toBe('1234 m');
    expect(formatAlt(1000, imperial)).toBe('3281 ft');
  });

  it('formats vario with sign per unit', () => {
    expect(formatVario(2.345, metric)).toBe('+2.3 m/s');
    expect(formatVario(-1, metric)).toBe('-1.0 m/s');
    expect(formatVario(0, metric)).toBe('0.0 m/s');
    expect(formatVario(1, imperial)).toBe('+200 ft/min');
    expect(formatVario(-0.02, imperial)).toBe('0 ft/min');
    expect(formatVario(1, aviation)).toBe('+1.9 kt');
  });

  it('formats speed', () => {
    expect(formatSpeed(10, metric)).toBe('36 km/h');
    expect(formatSpeed(10, imperial)).toBe('22 mph');
    expect(formatSpeed(10, aviation)).toBe('19 kt');
  });

  it('formats short distances in m or ft and long ones in km, mi or nm', () => {
    expect(formatDistance(850, metric)).toBe('850 m');
    expect(formatDistance(12_345, metric)).toBe('12.3 km');
    expect(formatDistance(500, imperial)).toBe('1640 ft');
    expect(formatDistance(16_093.44, imperial)).toBe('10.0 mi');
    expect(formatDistance(500, aviation)).toBe('1640 ft');
    expect(formatDistance(18_520, aviation)).toBe('10.0 nm');
  });
});

describe('presets', () => {
  it('names the preset a unit set matches', () => {
    expect(presetOf(metric)).toBe('metric');
    expect(presetOf({ ...imperial })).toBe('imperial');
    expect(presetOf(aviation)).toBe('aviation');
    expect(presetOf({ ...metric, alt: 'ft' })).toBe('custom');
  });

  it('parses stored units and falls back to metric per field', () => {
    expect(parseUnits(imperial)).toEqual(imperial);
    expect(parseUnits({ distance: 'nm', alt: 'yards', vario: 'kt' })).toEqual<Units>({
      distance: 'nm',
      alt: 'm',
      vario: 'kt',
      speed: 'kmh'
    });
    expect(parseUnits(null)).toEqual(metric);
    expect(parseUnits('metric')).toEqual(metric);
  });
});
