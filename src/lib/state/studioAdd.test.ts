import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Flight } from '#lib/domain/model';
import { pilotColor } from '#lib/ui/colors';

const scoreFlight = vi.hoisted(() => vi.fn(async () => null));
const groundSeries = vi.hoisted(() => vi.fn(async (fixes: unknown[]) => new Float32Array(fixes.length)));

vi.mock('#lib/xc/score', () => ({ scoreFlight }));
vi.mock('#lib/map/groundHeights', () => ({ groundSeries }));
vi.mock('#lib/storage', () => ({
  flightRepository: {
    getXcScore: async () => undefined,
    putXcScore: async () => {},
    getCameraTracks: async () => ({}),
    saveCameraTracks: async () => {}
  }
}));

import { StudioState } from './studio.svelte';

function flight(id: string, start = 0): Flight {
  const fixes = Array.from({ length: 20 }, (_, i) => ({
    t: start + i * 1000,
    lat: 47 + i * 1e-4,
    lon: 8,
    alt: 1000 + i
  }));
  return { id, pilot: id, date: '2025-01-01', sourceName: id, fixes } as unknown as Flight;
}

describe('StudioState.addFlights', () => {
  beforeEach(() => {
    scoreFlight.mockClear();
    groundSeries.mockClear();
  });

  it('appends new flights and skips loaded and repeated ones', () => {
    const s = new StudioState();
    s.setFlights([flight('a'), flight('b')]);
    s.addFlights([flight('b'), flight('c'), flight('c')]);
    expect(s.flights.map((f) => f.source.id)).toEqual(['a', 'b', 'c']);

    s.addFlights([flight('a')]);
    expect(s.flights).toHaveLength(3);
  });

  it('colours new flights with the next palette colour and respects overrides', () => {
    const s = new StudioState();
    s.setFlights([flight('a')], { colors: { c: '#123456' } });
    s.addFlights([flight('b'), flight('c')]);
    expect(s.flights.map((f) => f.color)).toEqual([pilotColor(0), pilotColor(1), '#123456']);
  });

  it('keeps time, selection, nudges and the sync mode', () => {
    const s = new StudioState();
    s.setFlights([flight('a'), flight('b')], { syncMode: 'real', nudges: { b: 2000 } });
    s.selectedId = 'b';
    s.seek(7000);
    s.addFlights([flight('c', 3000)]);
    expect(s.time).toBe(7000);
    expect(s.selectedId).toBe('b');
    expect(s.syncMode).toBe('real');
    expect(s.nudges).toEqual({ b: 2000 });
    expect(s.flights[1].timeOffset).toBe(2000);
  });

  it('starts ground heights and scoring only when needed, and only for new flights', async () => {
    const s = new StudioState();
    s.setFlights([flight('a')]);
    s.addFlights([flight('b')]);
    await new Promise((r) => setTimeout(r, 10));
    expect(scoreFlight).not.toHaveBeenCalled();
    expect(groundSeries).not.toHaveBeenCalled();

    const releaseXc = s.need('xc');
    const releaseGround = s.need('ground');
    await Promise.all([s.whenReady('xc'), s.whenReady('ground')]);
    expect(scoreFlight).toHaveBeenCalledTimes(2);
    expect(groundSeries).toHaveBeenCalledTimes(2);

    s.addFlights([flight('c')]);
    await Promise.all([s.whenReady('xc'), s.whenReady('ground')]);
    expect(scoreFlight).toHaveBeenCalledTimes(3);
    expect(groundSeries).toHaveBeenCalledTimes(3);
    expect(s.flights.every((f) => f.xc !== undefined && f.ground)).toBe(true);
    releaseXc();
    releaseGround();
  });
});
