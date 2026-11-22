import { describe, expect, it } from 'vitest';
import { monthlyHours, totals } from './logbook';

const HOUR = 3_600_000;
const flight = (date: string, hours: number) => ({ date, startTime: 0, endTime: hours * HOUR });

describe('logbook', () => {
  it('sums flights and airtime', () => {
    expect(totals([flight('2026-01-01', 1), flight('2026-01-02', 0.5)])).toEqual({ flights: 2, seconds: 5400 });
  });

  it('buckets hours per month and drops months out of range', () => {
    const out = monthlyHours(
      [flight('2026-11-03', 2), flight('2026-11-20', 1), flight('2026-09-01', 0.5), flight('2025-01-01', 9)],
      3,
      new Date('2026-11-22T12:00:00Z')
    );
    expect(out).toEqual([
      { month: '2026-09', hours: 0.5 },
      { month: '2026-10', hours: 0 },
      { month: '2026-11', hours: 3 }
    ]);
  });

  it('crosses the year boundary', () => {
    expect(monthlyHours([], 2, new Date('2026-01-10T00:00:00Z')).map((m) => m.month)).toEqual(['2025-12', '2026-01']);
  });
});
