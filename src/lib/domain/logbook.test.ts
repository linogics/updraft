import { describe, expect, it } from 'vitest';
import { breakdown, monthlyHours, totals, yearlyHours } from './logbook';

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

  it('breaks down by site with Unknown label, by hours', () => {
    const rows = breakdown(
      [{ ...flight('2026-01-01', 1), site: 'A', maxAlt: 1000 }, { ...flight('2026-01-02', 2), site: null }, { ...flight('2026-01-03', 0.5), site: 'A', maxAlt: 2000 }],
      'site'
    );
    expect(rows.map((r) => r.label)).toEqual(['Unknown', 'A']);
    expect(rows[1]).toEqual({ label: 'A', flights: 2, hours: 1.5, maxAlt: 2000, longestMin: 60 });
    expect(rows[0].maxAlt).toBeUndefined();
  });

  it('breaks down by year newest first and fills yearly gaps', () => {
    const fs = [flight('2024-05-01', 1), flight('2026-05-01', 2)];
    expect(breakdown(fs, 'year').map((r) => r.label)).toEqual(['2026', '2024']);
    expect(yearlyHours(fs)).toEqual([
      { year: '2024', hours: 1 },
      { year: '2025', hours: 0 },
      { year: '2026', hours: 2 }
    ]);
    expect(yearlyHours([])).toEqual([]);
  });
});
