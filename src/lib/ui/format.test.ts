import { describe, expect, it } from 'vitest';
import { formatAirtime, formatClock, formatDuration } from './format';

describe('format', () => {
  it('formats airtime as minutes or hours with minutes', () => {
    expect(formatAirtime(35 * 60_000)).toBe('35 min');
    expect(formatAirtime(95 * 60_000)).toBe('1 h 35');
    expect(formatAirtime(180 * 60_000)).toBe('3 h 00');
  });

  it('formats durations as h:mm:ss or m:ss', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3_725)).toBe('1:02:05');
  });

  it('formats a UTC clock time', () => {
    expect(formatClock(Date.UTC(2026, 6, 15, 13, 4, 9), 'UTC')).toBe('13:04:09');
  });
});
