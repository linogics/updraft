import { describe, expect, it } from 'vitest';
import { UNIT_PRESETS } from '../ui/units';
import { formatCategory } from './format';

describe('formatCategory', () => {
  it('turns the stored km, km/h and metres into the viewer units', () => {
    expect(formatCategory('freeDistance', 100, UNIT_PRESETS.metric)).toBe('100.0 km');
    expect(formatCategory('xcSpeed', 36, UNIT_PRESETS.metric)).toBe('36 km/h');
    expect(formatCategory('maxAltMsl', 1000, UNIT_PRESETS.imperial)).toBe('3281 ft');
    expect(formatCategory('xcPoints', 12.345, UNIT_PRESETS.metric)).toBe('12.35');
    expect(formatCategory('mostFlights', 7, UNIT_PRESETS.metric)).toBe('7');
  });
});
