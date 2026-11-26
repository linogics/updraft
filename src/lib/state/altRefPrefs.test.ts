import { describe, expect, it } from 'vitest';

import { parseAltRef } from './altRefPrefs';

describe('parseAltRef', () => {
  it('keeps agl and defaults everything else to msl', () => {
    expect(parseAltRef('agl')).toBe('agl');
    expect(parseAltRef('msl')).toBe('msl');
    expect(parseAltRef(null)).toBe('msl');
    expect(parseAltRef({ ref: 'agl' })).toBe('msl');
  });
});
