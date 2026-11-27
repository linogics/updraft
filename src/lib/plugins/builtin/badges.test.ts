import { describe, expect, it } from 'vitest';

import type { BadgeFlight } from '../badgeKind';
import { validatePlugin } from '../core';
import badges from './badges';

const f = (o: Partial<BadgeFlight> = {}): BadgeFlight => ({
  date: '2026-05-01',
  site: null,
  glider: null,
  durationS: 3600,
  freeDistance: 10_000,
  maxAltMsl: 2000,
  maxGain: 800,
  bestClimb: 2,
  bestThermalGain: 500,
  ...o
});
const value = (id: string, list: BadgeFlight[]) => badges.badges.find((b) => b.id === id)!.value(list);

describe('bundled badges', () => {
  it('pass validation with 15 badges', () => {
    expect(validatePlugin(badges)).toBe(badges);
    expect(badges.badges).toHaveLength(15);
  });

  it('takes maxima and sums', () => {
    const list = [f({ freeDistance: 20_000 }), f({ freeDistance: 50_000, durationS: 7200 })];
    expect(value('free-distance', list)).toBe(50_000);
    expect(value('total-airtime', list)).toBe(10_800);
    expect(value('flights', list)).toBe(2);
    expect(value('max-agl', list)).toBe(0);
    expect(value('xc-speed', [f({ xc: { kind: 'free', distance: 1, speed: 10 } }), f()])).toBe(10);
  });

  it('counts distinct names and days case-insensitively', () => {
    const list = [
      f({ site: 'Bassano', glider: ' Zeno ' }),
      f({ site: ' bassano', glider: 'zeno', date: '2026-05-02' }),
      f({ site: '' })
    ];
    expect(value('sites', list)).toBe(1);
    expect(value('gliders', list)).toBe(1);
    expect(value('flight-days', list)).toBe(2);
  });

  it('counts only flat and fai routes as triangles', () => {
    const list = [
      f({ xc: { kind: 'fai', distance: 30_000 } }),
      f({ xc: { kind: 'flat', distance: 60_000 } }),
      f({ xc: { kind: 'free', distance: 90_000 } })
    ];
    expect(value('triangles', list)).toBe(2);
    expect(value('biggest-triangle', list)).toBe(60_000);
  });
});
