import { describe, expect, it } from 'vitest';
import { AIRSPACE_CLASSES } from './model';
import { parseAirspacePrefs } from './prefs';

describe('parseAirspacePrefs', () => {
  it('defaults when nothing is stored', () => {
    expect(parseAirspacePrefs(null)).toEqual({
      show: false,
      classes: [...AIRSPACE_CLASSES],
      maxFloor: 4000,
      opacity: 0.25
    });
  });

  it('keeps valid fields, clamps numbers and starts hidden', () => {
    expect(parseAirspacePrefs({ show: true, classes: ['A', 'x', 'G'], maxFloor: 99999, opacity: 0 })).toEqual({
      show: false,
      classes: ['A', 'G'],
      maxFloor: 6000,
      opacity: 0.1
    });
  });

  it('falls back for garbage', () => {
    expect(parseAirspacePrefs({ show: 'yes', classes: 'A', maxFloor: 'x', opacity: NaN })).toEqual(
      parseAirspacePrefs(null)
    );
  });
});
