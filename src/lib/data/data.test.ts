import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Flight, FlightsService, FlightSummary, PrefsService } from '#lib/plugins/api';
import { services } from '#lib/plugins/services';
import { notifyLocalChange } from '#lib/storage/localChange';

// The real repository opens IndexedDB when it is imported.
vi.mock('#lib/storage', () => ({ flightRepository: {} }));

import { provideFlightsService } from './flights';
import { providePrefsService } from './prefs';

const summary = (id: string, extra: Partial<FlightSummary> = {}): FlightSummary => ({
  id,
  sourceName: '',
  pilot: 'P',
  glider: null,
  site: null,
  date: '2025-01-01',
  fixCount: 1,
  startTime: 0,
  endTime: 1,
  ...extra
});

const fixes = [{ t: 0, lat: 47, lon: 8, alt: 1000 }];

function fakeRepo() {
  const saved: unknown[] = [];
  return {
    saved,
    list: async () => [summary('a'), summary('m', { manual: true })],
    get: async (id: string) => (id === 'a' ? ({ id, fixes } as unknown as Flight) : undefined),
    save: async (f: Flight) => void saved.push(f),
    saveManual: async (e: unknown) => void saved.push(e),
    updateMeta: async () => {},
    delete: async () => {}
  };
}

afterEach(() => services.unregisterOwner('updraft'));

describe('updraft/flights@1', () => {
  function setup() {
    const repo = fakeRepo();
    provideFlightsService(repo as never);
    return { repo, flights: services.use<FlightsService>('updraft/flights@1') };
  }

  it('lists, gets and reads tracks, null for what is missing', async () => {
    const { flights } = setup();
    expect(await flights.list()).toHaveLength(2);
    expect((await flights.get('a'))?.id).toBe('a');
    expect(await flights.get('x')).toBeNull();
    expect(await flights.track('a')).toEqual(fixes);
    expect(await flights.track('m')).toBeNull();
  });

  it('saves and returns the id, and refuses a flight without fixes', async () => {
    const { repo, flights } = setup();
    const flight = { id: 'n', sourceName: 's', pilot: 'P', glider: null, site: null, date: '2025-01-01', fixes };
    expect(await flights.save(flight)).toBe('n');
    expect(repo.saved).toHaveLength(1);
    await expect(flights.save({ ...flight, fixes: [] })).rejects.toThrow('at least one fix');

    const id = await flights.saveManual({
      date: '2025-01-02',
      pilot: 'P',
      glider: null,
      site: null,
      durationMin: 30,
      notes: ''
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repo.saved.at(-1)).toMatchObject({ id });
  });

  it('fires changed on a local change and rejects other events', () => {
    const { flights } = setup();
    const fn = vi.fn();
    const off = flights.on('changed', fn);
    notifyLocalChange();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    notifyLocalChange();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(() => flights.on('nope' as never, fn)).toThrow('Unknown event');
  });
});

describe('updraft/prefs@1', () => {
  it('validates what it sets', () => {
    providePrefsService();
    const prefs = services.use<PrefsService>('updraft/prefs@1');
    const units = { ...prefs.units(), alt: 'ft' } as const;
    prefs.setUnits(units);
    expect(prefs.units().alt).toBe('ft');
    expect(() => prefs.setUnits({ ...units, alt: 'yd' } as never)).toThrow();

    prefs.setAltRef('agl');
    expect(prefs.altRef()).toBe('agl');
    expect(() => prefs.setAltRef('x' as never)).toThrow();

    expect(() => prefs.setLeague('nope')).toThrow('Unknown league "nope".');
    prefs.setThermals({ columns: false });
    expect([prefs.thermalColumns(), prefs.thermalLabels()]).toEqual([false, true]);
    expect(() => prefs.setThermals({ labels: 1 as never })).toThrow('expected boolean');
  });
});
