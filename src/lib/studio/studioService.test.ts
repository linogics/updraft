import { afterEach, describe, expect, it, vi } from 'vitest';

import { services } from '#lib/plugins/services';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';

import { provideStudioService, STUDIO_SERVICE, type StudioService } from './studioService.svelte';

const lf = (id: string, color: string) => ({
  flight: { id, pilot: id, glider: null, fixes: [] },
  color,
  visible: true
});

describe('updraft/studio@1', () => {
  afterEach(() => services.unregisterOwner('updraft'));

  it('returns the same frozen flights until they change', () => {
    const studio = { flights: [lf('a', '#111')], time: 0, selected: undefined, selectedId: null };
    provideStudioService(studio as never);
    const s = services.use<StudioService>(STUDIO_SERVICE);

    const first = s.flights();
    expect(s.flights()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(s.units()).toBe(s.units());

    studio.flights = [lf('a', '#222')];
    expect(s.flights()).not.toBe(first);
    expect(s.flights()[0].color).toBe('#222');
  });

  it('has events and refuses unknown ones', () => {
    provideStudioService({ flights: [], time: 0, selected: undefined } as never);
    const s = services.use<StudioService>(STUDIO_SERVICE);
    for (const e of [
      'time',
      'flights',
      'selection',
      'units',
      'altRef',
      'league',
      'playing',
      'range',
      'viewer'
    ] as const) {
      s.on(e, () => {})();
    }

    expect(() => s.on('x' as 'time', () => {})).toThrow('Unknown event "x" of updraft/studio@1.');
  });

  describe('writes', () => {
    const setup = (over: Record<string, unknown> = {}) => {
      const studio = {
        flights: [lf('a', '#111')],
        time: 0,
        selected: undefined,
        selectedId: null,
        start: 1000,
        end: 5000,
        exportIn: null as number | null,
        exportOut: null as number | null,
        playing: false,
        play: vi.fn(),
        pause: vi.fn(),
        setVisible: vi.fn(),
        setLeague: vi.fn(),
        ...over
      };
      provideStudioService(studio as never);
      return { studio, s: services.use<StudioService>(STUDIO_SERVICE) };
    };

    it('sets visibility of known flights only', () => {
      const { studio, s } = setup();
      s.setVisible('a', false);
      s.setVisible('nope', false);
      expect(studio.setVisible).toHaveBeenCalledTimes(1);
      expect(studio.setVisible).toHaveBeenCalledWith('a', false);
      expect(() => s.setVisible('a', 0 as never)).toThrow('visible: expected boolean');
    });

    it('switches the league through the studio', () => {
      const before = xcPrefs.league;
      try {
        const { studio, s } = setup();
        expect(s.leagues()).toBe(s.leagues());
        expect(Object.isFrozen(s.leagues())).toBe(true);
        expect(s.league()).toBe(before);
        expect(() => s.setLeague('x')).toThrow('Unknown league "x".');
        s.setLeague(before);
        expect(studio.setLeague).not.toHaveBeenCalled();
        const other = s.leagues().find((l) => l.id !== before)!.id;
        s.setLeague(other);
        expect(studio.setLeague).toHaveBeenCalledWith(other);
      } finally {
        xcPrefs.set(before);
      }
    });

    it('plays and pauses through the studio', () => {
      const { studio, s } = setup();
      s.play();
      expect(studio.play).toHaveBeenCalledTimes(1);
      studio.playing = true;
      expect(s.playing()).toBe(true);
      s.pause();
      expect(studio.pause).toHaveBeenCalledTimes(1);
    });

    it('reads and writes the range', () => {
      const { studio, s } = setup();
      const first = s.range();
      expect(first).toEqual({ start: 1000, end: 5000 });
      expect(Object.isFrozen(first)).toBe(true);
      expect(s.range()).toBe(first);

      s.setRange(2000, 3000);
      expect([studio.exportIn, studio.exportOut]).toEqual([2000, 3000]);
      expect(s.range()).toEqual({ start: 2000, end: 3000 });
      expect(s.range()).toBe(s.range());

      s.setRange(-5, 99999);
      expect([studio.exportIn, studio.exportOut]).toEqual([1000, 5000]);

      s.clearRange();
      expect([studio.exportIn, studio.exportOut]).toEqual([null, null]);
      expect(s.range()).toEqual({ start: 1000, end: 5000 });
    });

    it('refuses a bad range and leaves the marks alone', () => {
      const { studio, s } = setup();
      // The schema check runs first, the service's own messages only reach unchecked callers.
      const finite = /expected number/;
      expect(() => s.setRange(NaN, 3000)).toThrow(finite);
      expect(() => s.setRange(1000, Infinity)).toThrow(finite);
      expect(() => s.setRange('1' as never, 3000)).toThrow(finite);
      expect(() => s.setRange(3000, 3000)).toThrow('Range start must be before end.');
      expect(() => s.setRange(4000, 2000)).toThrow('Range start must be before end.');
      expect(() => s.setRange(100, 500)).toThrow('Range start must be before end.');
      expect(() => s.setRange(8000, 9000)).toThrow('Range start must be before end.');
      expect([studio.exportIn, studio.exportOut]).toEqual([null, null]);
    });
  });
});
