import { describe, expect, it } from 'vitest';
import { formatClock, formatDistance, formatDuration, formatVario } from './format';

describe('format', () => {
  it('formats durations as h:mm:ss or m:ss', () => {
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3_725)).toBe('1:02:05');
  });

  it('formats distances in m below 1 km, km above', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(12_345)).toBe('12.3 km');
  });

  it('formats vario with sign and one decimal', () => {
    expect(formatVario(2.345)).toBe('+2.3 m/s');
    expect(formatVario(-1)).toBe('-1.0 m/s');
    expect(formatVario(0)).toBe('0.0 m/s');
  });

  it('formats a UTC clock time', () => {
    expect(formatClock(Date.UTC(2026, 6, 15, 13, 4, 9), 'UTC')).toBe('13:04:09');
  });
});
