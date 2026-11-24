import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flight } from '#lib/domain/model';

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

function flight(id: string): Flight {
  const fixes = Array.from({ length: 20 }, (_, i) => ({
    t: i * 1000,
    lat: 47 + i * 1e-4,
    lon: 8,
    alt: 1000 + i
  }));
  return { id, pilot: id, date: '2025-01-01', sourceName: id, fixes } as unknown as Flight;
}

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('StudioState.need', () => {
  beforeEach(() => {
    scoreFlight.mockClear();
    groundSeries.mockClear();
  });

  it('does no heavy work without a need', async () => {
    const s = new StudioState();
    s.setFlights([flight('a'), flight('b')]);
    await flush();
    expect(scoreFlight).not.toHaveBeenCalled();
    expect(groundSeries).not.toHaveBeenCalled();
    expect(s.flights[0].xc).toBeUndefined();
  });

  it('starts on the first need only', async () => {
    const s = new StudioState();
    s.setFlights([flight('a'), flight('b')]);
    const r1 = s.need('xc');
    const r2 = s.need('xc');
    await s.whenReady('xc');
    expect(scoreFlight).toHaveBeenCalledTimes(2);
    expect(s.xcBusy).toBe(false);
    r1();
    r2();
  });

  it('loads ground heights on demand', async () => {
    const s = new StudioState();
    s.setFlights([flight('a')]);
    const release = s.need('ground');
    expect(s.groundBusy).toBe(true);
    await s.whenReady('ground');
    expect(s.flights[0].ground).toBeDefined();
    expect(s.groundBusy).toBe(false);
    release();
  });

  it('cancels at the next step on release and stops scoring', async () => {
    const s = new StudioState();
    s.setFlights([flight('a'), flight('b'), flight('c')]);
    const release = s.need('xc');
    // The first flight is already being scored when the need goes away.
    await Promise.resolve();
    release();
    expect(s.xcBusy).toBe(false);
    await flush();
    expect(scoreFlight).toHaveBeenCalledTimes(1);
    expect(s.flights.filter((f) => f.xc !== undefined)).toHaveLength(0);
  });

  it('restarts on new flights and league only while needed', async () => {
    const s = new StudioState();
    s.setFlights([flight('a')]);
    s.setLeague('FFVL');
    await flush();
    expect(scoreFlight).not.toHaveBeenCalled();

    const release = s.need('xc');
    await s.whenReady('xc');
    expect(scoreFlight).toHaveBeenCalledTimes(1);
    s.setFlights([flight('b')]);
    await s.whenReady('xc');
    expect(scoreFlight).toHaveBeenCalledTimes(2);
    release();
    s.setFlights([flight('c')]);
    await flush();
    expect(scoreFlight).toHaveBeenCalledTimes(2);
  });
});
