import { describe, expect, it } from 'vitest';
import { parseXcLeague } from './xcPrefs';

describe('parseXcLeague', () => {
  it('keeps a known league', () => {
    expect(parseXcLeague('FFVL')).toBe('FFVL');
    expect(parseXcLeague('XCLeague')).toBe('XCLeague');
  });

  it('falls back to XContest for anything else', () => {
    expect(parseXcLeague(null)).toBe('XContest');
    expect(parseXcLeague('FAI-OAR')).toBe('XContest');
    expect(parseXcLeague(3)).toBe('XContest');
  });
});
