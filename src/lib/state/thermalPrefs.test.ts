import { describe, expect, it } from 'vitest';

import { parseThermalPrefs } from './thermalPrefs';

describe('parseThermalPrefs', () => {
  it('defaults both parts to shown when nothing is stored', () => {
    expect(parseThermalPrefs(null)).toEqual({ columns: true, labels: true });
  });

  it('keeps a missing field at shown', () => {
    expect(parseThermalPrefs({ columns: false })).toEqual({ columns: false, labels: true });
  });

  it('falls back to shown for garbage', () => {
    expect(parseThermalPrefs('nope')).toEqual({ columns: true, labels: true });
    expect(parseThermalPrefs({ columns: 'no', labels: 0 })).toEqual({ columns: true, labels: true });
  });
});
