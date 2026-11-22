import { describe, expect, it } from 'vitest';
import { analyzeFlight } from '../domain/analysis/analyze';
import groundGrid from './groundGrid.json';
import { buildDemoFlights } from './demoFlights';

// Bilinear ground height from the grid written by scripts/demo-terrain.mjs.
function groundAt(lat: number, lon: number): number {
  const g = groundGrid;
  const u = ((lon - g.west) / (g.east - g.west)) * (g.cols - 1);
  const v = ((g.north - lat) / (g.north - g.south)) * (g.rows - 1);
  const c0 = Math.min(Math.floor(u), g.cols - 2);
  const r0 = Math.min(Math.floor(v), g.rows - 2);
  const fx = u - c0;
  const fy = v - r0;
  const h = (r: number, c: number) => g.heights[r * g.cols + c];
  const top = h(r0, c0) * (1 - fx) + h(r0, c0 + 1) * fx;
  const bottom = h(r0 + 1, c0) * (1 - fx) + h(r0 + 1, c0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

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

  it('keeps every fix inside the ground grid and at least 150 m above ground', () => {
    const g = groundGrid;
    for (const f of flights) {
      let minAgl = Infinity;
      for (const fix of f.fixes) {
        expect(fix.lat).toBeGreaterThanOrEqual(g.south);
        expect(fix.lat).toBeLessThanOrEqual(g.north);
        expect(fix.lon).toBeGreaterThanOrEqual(g.west);
        expect(fix.lon).toBeLessThanOrEqual(g.east);
        minAgl = Math.min(minAgl, fix.alt - groundAt(fix.lat, fix.lon));
      }
      expect(minAgl, f.pilot).toBeGreaterThanOrEqual(150);
    }
  });
});
