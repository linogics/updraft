import { describe, expect, it } from 'vitest';
import { analyzeFlight } from '../domain/analysis/analyze';
import { buildDemoFlights } from './demoFlights';

describe('buildDemoFlights', () => {
  const flights = buildDemoFlights();

  it('builds two pilots on the same day', () => {
    expect(flights).toHaveLength(2);
    expect(new Set(flights.map((f) => f.date)).size).toBe(1);
    expect(flights[0].pilot).not.toBe(flights[1].pilot);
  });

  it('produces tracks the analysis recognises as thermalling flights', () => {
    for (const f of flights) {
      const a = analyzeFlight(f);
      expect(a.thermals.filter((t) => t.gain > 100).length).toBeGreaterThanOrEqual(3);
      expect(a.stats.duration).toBeGreaterThan(20 * 60);
    }
  });
});
